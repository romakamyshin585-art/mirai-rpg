/**
 * Progression service. The most important service in the app.
 *
 * completeQuest() does, in one transaction:
 *   1. Loads the quest
 *   2. Counts prior completions in the same category (for DR)
 *   3. Inserts a quest_completion row (history + DR + day-source)
 *   4. Increments character.xp by awarded XP
 *   5. Increments stat.value and stat.xp_total_in_category
 *   6. Returns summary (xp_awarded, dr_multiplier, new_total_xp, new_level, ...)
 *
 * Transactional: if any step throws, nothing persists.
 */

import type { DbExecutor } from '../db/executor';
import type { Category } from '../domain/category';
import { applyDr, DEFAULT_DR_CONFIG, type DrConfig } from '../domain/dr';
import { levelProgress } from '../domain/level';
import { QuestRepo, CompletionRepo } from '../repos/quest_repo';
import { CharacterRepo, StatRepo } from '../repos/character_repo';
import type { CharacterClass } from '../repos/character_repo';

const CLASS_BY_CATEGORY: Record<string, CharacterClass> = {
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

export class ProgressionService {
  constructor(
    private readonly db: DbExecutor,
    private readonly drConfig: DrConfig = DEFAULT_DR_CONFIG,
  ) {}

  async completeQuest(userId: string, questId: string, _at: Date = new Date()): Promise<CompleteQuestResult> {
    return this.db.withTransaction(async (tx) => {
      const qRepo = new QuestRepo(tx);
      const cRepo = new CompletionRepo(tx);
      const charRepo = new CharacterRepo(tx);
      const statRepo = new StatRepo(tx);

      const quest = await qRepo.getById(questId);
      if (!quest) throw new Error('Quest not found');
      if (!quest.is_active) throw new Error('Quest is not active');

      // Authorization: quest must be system or owned
      if (quest.user_id !== null && quest.user_id !== userId) {
        throw new Error('Not your quest');
      }

      const character = await charRepo.getByUser(userId);
      if (!character) throw new Error('No character for user');

      const prior = await cRepo.countByCategory(userId, quest.category);
      const { awarded, multiplier } = applyDr(quest.xp_reward, prior, this.drConfig);

      // 1. Insert completion
      const completion = await cRepo.insert({
        quest_id: quest.id,
        user_id: userId,
        category: quest.category,
        xp_awarded: awarded,
        dr_multiplier: multiplier,
      });

      // 2. Increment character XP
      const charAfter = await charRepo.addXp(character.id, awarded);
      if (!charAfter) throw new Error('Failed to update character');

      // 3. Recompute level
      const newLevel = levelProgress(charAfter.xp).level;
      const leveledUp = newLevel !== character.level;
      if (leveledUp) {
        await charRepo.setLevel(character.id, newLevel);
      }

      // 4. Increment stat (value = +1 per completion, xp accumulates)
      const stat = await statRepo.incrementValue(character.id, quest.category, 1, awarded);

      // 5. Class auto-detect on first level-up (≥ L2). Same rule as CharacterService.
      let finalClass: CharacterClass = character.class;
      if (!character.class && newLevel >= 2) {
        const allStats = await statRepo.list(character.id);
        const total = allStats.reduce((s, r) => s + r.xp_total_in_category, 0);
        if (total > 0) {
          let top: { cat: string; pct: number } | null = null;
          for (const s of allStats) {
            const pct = s.xp_total_in_category / total;
            if (!top || pct > top.pct) top = { cat: s.category, pct };
          }
          // 0.4 (any majority) is too low — at 50/50 the first stat wins
          // but the user is balanced. Require strict > 0.5 to commit to a class.
          if (top && top.pct > 0.5) {
            const cls = CLASS_BY_CATEGORY[top.cat] ?? null;
            if (cls) {
              await charRepo.setClass(character.id, cls);
              finalClass = cls;
            }
          }
        }
      }

      return {
        completionId: completion.id,
        questId: quest.id,
        category: quest.category,
        baseXp: quest.xp_reward,
        xpAwarded: awarded,
        drMultiplier: multiplier,
        totalXp: charAfter.xp,
        newLevel,
        leveledUp,
        statValue: stat?.value ?? 0,
        statXpTotal: stat?.xp_total_in_category ?? 0,
        characterClass: finalClass,
      };
    });
  }
}
