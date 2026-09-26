/**
 * Boot-time seed. Idempotent: only inserts missing rows.
 *
 *   - achievement_def: insert all codes (insertDef checks for existing code)
 *   - quest: insert every shipped system quest whose title is not in the
 *     catalogue yet.
 *
 * The quest rule used to be "only if the catalogue is empty". That was
 * fine with one wave of quests and wrong the moment a second wave shipped:
 * an existing profile would never see the new 150. It now diffs on title,
 * which keeps the boot idempotent *and* additive.
 *
 * Archiving is respected. `setActive(0)` is a soft delete on the row, so a
 * quest the user removed stays in the table and the title diff skips it —
 * the seeder never resurrects it.
 */

import type { DbExecutor } from '../db/executor';
import { AchievementRepo } from '../repos/achievement_repo';
import { QuestRepo } from '../repos/quest_repo';
import { ACHIEVEMENT_SEED } from './achievements';
import { QUEST_SEED_ALL } from './quests';

export async function seedIfEmpty(db: DbExecutor): Promise<{ achievementsInserted: number; questsInserted: number }> {
  return db.withTransaction(async (tx) => {
    const aRepo = new AchievementRepo(tx);
    const qRepo = new QuestRepo(tx);

    let aInserted = 0;
    for (const def of ACHIEVEMENT_SEED) {
      const existed = await aRepo.getByCode(def.code);
      if (existed) continue;
      await aRepo.insertDef(def);
      aInserted += 1;
    }

    // One query for every known title, then insert only the diff. The
    // catalogue is a few hundred rows, so this stays a single read
    // instead of a SELECT per quest.
    const existingTitles = new Set((await qRepo.listSystem()).map(quest => quest.title));
    let qInserted = 0;
    for (const quest of QUEST_SEED_ALL) {
      if (existingTitles.has(quest.title)) continue;
      await qRepo.insert({
        user_id: null,
        title: quest.title,
        description: quest.description,
        category: quest.category,
        difficulty: quest.difficulty,
        xp_reward: quest.xp_reward,
        is_system: 1,
        is_active: 1,
      });
      existingTitles.add(quest.title);
      qInserted += 1;
    }

    return { achievementsInserted: aInserted, questsInserted: qInserted };
  });
}
