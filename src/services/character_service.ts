/**
 * Character service.
 *
 * Auto-detect class on first level-up (when the character has earned enough
 * XP to reach level 2). Rules:
 *   - if health XP > 50% of total XP → warrior
 *   - if knowledge XP > 50% → scholar
 *   - if career XP > 50% → builder
 *   - if discipline XP > 50% → monk
 *   - if social XP > 50% → leader
 *   - else → keep the most-pumped stat as the class
 *
 * For solo use, "class" is flavour only — no skill tree, no bonuses.
 */

import type { DbExecutor } from '../db/executor';
import { CharacterRepo, StatRepo } from '../repos/character_repo';
import type { CharacterClass } from '../repos/character_repo';
import { levelProgress } from '../domain/level';

export class CharacterService {
  private char: CharacterRepo;
  private stat: StatRepo;
  constructor(db: DbExecutor) {
    this.char = new CharacterRepo(db);
    this.stat = new StatRepo(db);
  }

  /** Get character for user, creating one if missing. Ensures stat rows. */
  async getOrCreate(userId: string, name = 'Hero'): Promise<Awaited<ReturnType<CharacterRepo['getByUser']>> & {}> {
    let c = await this.char.getByUser(userId);
    if (!c) {
      c = await this.char.create(userId, name);
      await this.stat.ensureAll(c!.id);
    }
    return c!;
  }

  async get(userId: string) {
    return this.char.getByUser(userId);
  }

  async setName(userId: string, name: string) {
    const c = await this.char.getByUser(userId);
    if (!c) throw new Error('No character');
    await this.char.setName(c.id, name);
    return this.char.getByUser(userId);
  }

  async getStats(characterId: string) {
    return this.stat.list(characterId);
  }

  /**
   * Apply XP delta. Computes the new level from total XP. If the level
   * increased AND the character has no class yet, auto-detect one.
   */
  async applyXp(characterId: string, xpDelta: number) {
    const updated = await this.char.addXp(characterId, xpDelta);
    if (!updated) return null;
    const newLevel = levelProgress(updated.xp).level;
    if (newLevel !== updated.level) {
      await this.char.setLevel(updated.id, newLevel);
    }
    if (!updated.class && newLevel >= 2) {
      const cls = await this.detectClass(updated.id);
      if (cls) await this.char.setClass(updated.id, cls);
    }
    return this.char.getById(updated.id);
  }

  /**
   * Choose the class from current stat distribution.
   * Returns null if no stat has a clear majority (i.e. user is balanced —
   * keep class = null, no class yet).
   */
  async detectClass(characterId: string): Promise<CharacterClass> {
    const stats = await this.stat.list(characterId);
    const total = stats.reduce((s, r) => s + r.xp_total_in_category, 0);
    if (total === 0) return null;
    let top: { cat: string; pct: number } | null = null;
    for (const s of stats) {
      const pct = s.xp_total_in_category / total;
      if (!top || pct > top.pct) top = { cat: s.category, pct };
    }
    if (!top || top.pct <= 0.5) return null;  // balanced → no class yet
    switch (top.cat) {
      case 'health': return 'warrior';
      case 'knowledge': return 'scholar';
      case 'career': return 'builder';
      case 'discipline': return 'monk';
      case 'social': return 'leader';
      default: return null;
    }
  }
}
