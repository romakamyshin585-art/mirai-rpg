/**
 * Boot-time seed. Idempotent: only inserts missing rows.
 *
 *   - achievement_def: insert all codes (insertDef checks for existing code)
 *   - quest: insert all 76 system quests (only if catalog is empty)
 */

import type { DbExecutor } from '../db/executor';
import { AchievementRepo } from '../repos/achievement_repo';
import { QuestRepo } from '../repos/quest_repo';
import { ACHIEVEMENT_SEED } from './achievements';
import { QUEST_SEED } from './quests';

export async function seedIfEmpty(db: DbExecutor): Promise<{ achievementsInserted: number; questsInserted: number }> {
  const aRepo = new AchievementRepo(db);
  const qRepo = new QuestRepo(db);

  let aInserted = 0;
  for (const def of ACHIEVEMENT_SEED) {
    const existed = await aRepo.getByCode(def.code);
    if (existed) continue;
    await aRepo.insertDef(def);
    aInserted += 1;
  }

  let qInserted = 0;
  const existing = await qRepo.listSystem();
  if (existing.length === 0) {
    for (const q of QUEST_SEED) {
      await qRepo.insert({
        user_id: null,
        title: q.title,
        description: q.description,
        category: q.category,
        difficulty: q.difficulty,
        xp_reward: q.xp_reward,
        is_system: 1,
        is_active: 1,
      });
      qInserted += 1;
    }
  }

  return { achievementsInserted: aInserted, questsInserted: qInserted };
}
