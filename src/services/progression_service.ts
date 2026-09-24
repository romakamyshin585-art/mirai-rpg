import type { DbExecutor } from '../db/executor';
import type { Category } from '../domain/category';
import { applyDr, DEFAULT_DR_CONFIG, type DrConfig } from '../domain/dr';
import { levelProgress } from '../domain/level';
import { QuestRepo, CompletionRepo } from '../repos/quest_repo';
import { CharacterRepo, StatRepo } from '../repos/character_repo';
import type { CharacterClass, CharacterRow } from '../repos/character_repo';
import { AchievementRepo } from '../repos/achievement_repo';
import { dayKey } from '../domain/time';

const CLASS_BY_CATEGORY: Record<Category, CharacterClass> = {
  health: 'warrior',
  knowledge: 'scholar',
  career: 'builder',
  discipline: 'monk',
  social: 'leader',
};

export interface CompleteQuestResult {
  completionId: string;
  questId: string;
  category: Category;
  baseXp: number;
  xpAwarded: number;
  drMultiplier: number;
  totalXp: number;
  newLevel: number;
  leveledUp: boolean;
  statValue: number;
  statXpTotal: number;
  characterClass: CharacterClass;
}

export type UndoQuestCompletionFailureReason =
  | 'not_found'
  | 'not_owned'
  | 'character_not_found'
  | 'stat_not_found';

export interface UndoQuestCompletionResult {
  ok: boolean;
  success: boolean;
  removed: boolean;
  undone: boolean;
  completionId: string;
  questId: string | null;
  category: Category | null;
  xpRemoved: number;
  totalXp: number;
  levelBefore: number;
  levelAfter: number;
  newLevel: number;
  statValue: number;
  statValueBefore: number;
  statXpTotal: number;
  statXpTotalBefore: number;
  characterClass: CharacterClass;
  reason?: UndoQuestCompletionFailureReason;
}

export class ProgressionService {
  constructor(
    private readonly db: DbExecutor,
    private readonly drConfig: DrConfig = DEFAULT_DR_CONFIG,
  ) {}

  async completeQuest(userId: string, questId: string): Promise<CompleteQuestResult> {
    return this.db.withTransaction(async (tx) => {
      const qRepo = new QuestRepo(tx);
      const cRepo = new CompletionRepo(tx);
      const charRepo = new CharacterRepo(tx);
      const statRepo = new StatRepo(tx);

      const quest = await qRepo.getById(questId);
      if (!quest) throw new Error('Quest not found');
      if (!quest.is_active) throw new Error('Quest is not active');
      if (quest.user_id !== null && quest.user_id !== userId) throw new Error('Not your quest');

      const character = await charRepo.getByUser(userId);
      if (!character) throw new Error('No character for user');

      const prior = await cRepo.countByCategory(userId, quest.category);
      const { awarded, multiplier } = applyDr(quest.xp_reward, prior, this.drConfig);
      const completion = await cRepo.insert({
        quest_id: quest.id,
        user_id: userId,
        category: quest.category,
        xp_awarded: awarded,
        dr_multiplier: multiplier,
      });

      const charAfter = await charRepo.addXp(character.id, awarded);
      if (!charAfter) throw new Error('Failed to update character');
      const newLevel = levelProgress(charAfter.xp).level;
      const leveledUp = newLevel !== character.level;
      await charRepo.setLevel(character.id, newLevel);

      await statRepo.ensureAll(character.id);
      const stat = await statRepo.incrementValue(character.id, quest.category, 1, awarded);
      if (!stat) throw new Error('Failed to update stat');

      let finalClass = character.class;
      if (!finalClass && newLevel >= 2) {
        finalClass = await this.detectClass(statRepo, character.id);
        if (finalClass) await charRepo.setClass(character.id, finalClass);
      }

      const finalCharacter = await charRepo.getById(character.id);
      if (!finalCharacter) throw new Error('Failed to reload character');
      return {
        completionId: completion.id,
        questId: quest.id,
        category: quest.category,
        baseXp: quest.xp_reward,
        xpAwarded: awarded,
        drMultiplier: multiplier,
        totalXp: finalCharacter.xp,
        newLevel,
        leveledUp,
        statValue: stat.value,
        statXpTotal: stat.xp_total_in_category,
        characterClass: finalCharacter.class,
      };
    });
  }

  async undoQuestCompletion(
    userId: string,
    completionId: string,
    achievementCodes: string[] = [],
  ): Promise<UndoQuestCompletionResult> {
    return this.db.withTransaction(async (tx) => {
      const cRepo = new CompletionRepo(tx);
      const charRepo = new CharacterRepo(tx);
      const statRepo = new StatRepo(tx);
      const completion = await cRepo.getById(completionId);
      const base = this.undoFailure(completionId, 'not_found');

      if (!completion) return base;
      if (completion.user_id !== userId) {
        return {
          ...base,
          questId: completion.quest_id,
          category: completion.category,
          reason: 'not_owned',
        };
      }

      const character = await charRepo.getByUser(userId);
      if (!character) {
        return {
          ...base,
          questId: completion.quest_id,
          category: completion.category,
          reason: 'character_not_found',
        };
      }

      await statRepo.ensureAll(character.id);
      const statBefore = await statRepo.get(character.id, completion.category);
      if (!statBefore) {
        return {
          ...base,
          questId: completion.quest_id,
          category: completion.category,
          levelBefore: character.level,
          levelAfter: character.level,
          newLevel: character.level,
          totalXp: character.xp,
          characterClass: character.class,
          reason: 'stat_not_found',
        };
      }

      const removed = await cRepo.delete(completion.id);
      if (!removed) return base;

      const xpRemoved = Math.max(0, Math.floor(Number(completion.xp_awarded) || 0));
      const nextXp = Math.max(0, character.xp - xpRemoved);
      const updatedCharacter = await charRepo.setXp(character.id, nextXp);
      if (!updatedCharacter) throw new Error('Failed to roll back character XP');
      const levelAfter = levelProgress(updatedCharacter.xp).level;
      await charRepo.setLevel(character.id, levelAfter);

      const statAfter = await statRepo.decrementValue(character.id, completion.category, 1, xpRemoved);
      if (!statAfter) throw new Error('Failed to roll back stat');

      const achievementRepo = new AchievementRepo(tx);
      for (const code of new Set(achievementCodes)) {
        const definition = await achievementRepo.getByCode(code);
        if (definition) await achievementRepo.deleteUnlock(userId, definition.id);
      }

      const history = await cRepo.listAll(userId);
      const dayTotals = new Map<string, { value: number; achievedAt: string }>();
      const categoryTotals = new Map<Category, { value: number; achievedAt: string }>();
      for (const row of history) {
        const day = dayKey(new Date(row.completed_at));
        const dayTotal = (dayTotals.get(day)?.value ?? 0) + row.xp_awarded;
        dayTotals.set(day, { value: dayTotal, achievedAt: row.completed_at });
        const categoryTotal = (categoryTotals.get(row.category)?.value ?? 0) + row.xp_awarded;
        categoryTotals.set(row.category, { value: categoryTotal, achievedAt: row.completed_at });
      }
      await tx.exec(`DELETE FROM personal_best WHERE user_id = ?`, [userId]);
      const bestDay = [...dayTotals.values()].sort((a, b) => b.value - a.value)[0];
      if (bestDay) {
        await tx.exec(
          `INSERT INTO personal_best (user_id, scope, value, achieved_at) VALUES (?, ?, ?, ?)`,
          [userId, 'day', bestDay.value, bestDay.achievedAt],
        );
      }
      for (const [category, best] of categoryTotals) {
        await tx.exec(
          `INSERT INTO personal_best (user_id, scope, value, achieved_at) VALUES (?, ?, ?, ?)`,
          [userId, `category:${category}`, best.value, best.achievedAt],
        );
      }

      let finalClass = character.class;
      if (finalClass) {
        finalClass = await this.detectClass(statRepo, character.id);
        await charRepo.setClass(character.id, finalClass);
      }

      const finalCharacter = await charRepo.getById(character.id);
      if (!finalCharacter) throw new Error('Failed to reload character');
      return {
        ok: true,
        success: true,
        removed: true,
        undone: true,
        completionId,
        questId: completion.quest_id,
        category: completion.category,
        xpRemoved,
        totalXp: finalCharacter.xp,
        levelBefore: character.level,
        levelAfter,
        newLevel: levelAfter,
        statValue: statAfter.value,
        statValueBefore: statBefore.value,
        statXpTotal: statAfter.xp_total_in_category,
        statXpTotalBefore: statBefore.xp_total_in_category,
        characterClass: finalCharacter.class,
      };
    });
  }

  private async detectClass(statRepo: StatRepo, characterId: string): Promise<CharacterClass> {
    const stats = await statRepo.list(characterId);
    const total = stats.reduce((sum, row) => sum + row.xp_total_in_category, 0);
    if (total <= 0) return null;
    let top: { category: Category; percent: number } | null = null;
    for (const row of stats) {
      const percent = row.xp_total_in_category / total;
      if (!top || percent > top.percent) top = { category: row.category, percent };
    }
    return top && top.percent > 0.5 ? CLASS_BY_CATEGORY[top.category] : null;
  }

  private undoFailure(
    completionId: string,
    reason: UndoQuestCompletionFailureReason,
    character?: CharacterRow,
  ): UndoQuestCompletionResult {
    const totalXp = character?.xp ?? 0;
    const level = character?.level ?? 0;
    return {
      ok: false,
      success: false,
      removed: false,
      undone: false,
      completionId,
      questId: null,
      category: null,
      xpRemoved: 0,
      totalXp,
      levelBefore: level,
      levelAfter: level,
      newLevel: level,
      statValue: 0,
      statValueBefore: 0,
      statXpTotal: 0,
      statXpTotalBefore: 0,
      characterClass: character?.class ?? null,
      reason,
    };
  }
}
