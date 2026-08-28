/**
 * SQL schema for Mirai RPG. Single source of truth.
 *
 * Migrations are applied by `db/migrate.ts` in order, idempotently,
 * tracked by the `schema_version` row in the `config` table.
 *
 * Design rules (mirrors the old LifeRPG, minus all the social/cosmetics/admin):
 *   - One user (auth via bcrypt password hash, stored in secure-store).
 *   - One character per user.
 *   - 5 stat rows per character (one per category).
 *   - Quests: 76 system + user-created. Visible = system OR own.
 *   - Quest completions = history for DR counting + streak/achievement triggers.
 *   - Achievements = milestone events unlocked.
 *   - No friends, no leaderboard, no admin, no photo proof, no shop.
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: readonly string[] = [
  // --- config: tunable magic numbers -----------------------------------------
  `CREATE TABLE IF NOT EXISTS config (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,

  // --- user (single user app; keeping the table for future-proofing) ---------
  `CREATE TABLE IF NOT EXISTS user (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     created_at    TEXT NOT NULL  -- ISO-8601
   );`,

  // --- character ------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS character (
     id        TEXT PRIMARY KEY,
     user_id   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     name      TEXT,
     class     TEXT,             -- warrior | scholar | builder | monk | leader
     level     INTEGER NOT NULL DEFAULT 1,
     xp        INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS ix_character_user ON character(user_id);`,

  // --- 5 stats per character, one per category -------------------------------
  `CREATE TABLE IF NOT EXISTS stat (
     character_id          TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
     category              TEXT NOT NULL,    -- health|knowledge|career|discipline|social
     value                 INTEGER NOT NULL DEFAULT 0,
     xp_total_in_category  INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (character_id, category)
   );`,

  // --- quest ----------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS quest (
     id           TEXT PRIMARY KEY,
     user_id      TEXT REFERENCES user(id) ON DELETE CASCADE,  -- NULL = system
     title        TEXT NOT NULL,
     description  TEXT,
     category     TEXT NOT NULL,
     difficulty   INTEGER NOT NULL DEFAULT 1,  -- 1..3
     xp_reward    INTEGER NOT NULL DEFAULT 20,
     is_system    INTEGER NOT NULL DEFAULT 0,  -- 0|1
     is_active    INTEGER NOT NULL DEFAULT 1,  -- 0|1
     created_at   TEXT NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS ix_quest_user    ON quest(user_id);`,
  `CREATE INDEX IF NOT EXISTS ix_quest_system  ON quest(is_system, is_active);`,

  // --- completion (history + DR + streak source) -----------------------------
  `CREATE TABLE IF NOT EXISTS quest_completion (
     id           TEXT PRIMARY KEY,
     quest_id     TEXT NOT NULL REFERENCES quest(id) ON DELETE CASCADE,
     user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     category     TEXT NOT NULL,
     xp_awarded   INTEGER NOT NULL,
     dr_multiplier REAL NOT NULL DEFAULT 1.0,
     completed_at TEXT NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS ix_completion_user     ON quest_completion(user_id);`,
  `CREATE INDEX IF NOT EXISTS ix_completion_user_cat ON quest_completion(user_id, category);`,
  `CREATE INDEX IF NOT EXISTS ix_completion_time     ON quest_completion(user_id, completed_at);`,

  // --- achievement definition (catalog) + unlocks (per-user) -----------------
  `CREATE TABLE IF NOT EXISTS achievement (
     id          TEXT PRIMARY KEY,
     code        TEXT NOT NULL UNIQUE,
     name        TEXT NOT NULL,
     description TEXT NOT NULL,
     rarity      TEXT NOT NULL DEFAULT 'common',  -- common|rare|epic|legendary
     icon        TEXT NOT NULL DEFAULT '🏆',
     created_at  TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS achievement_unlock (
     id              TEXT PRIMARY KEY,
     user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     achievement_id  TEXT NOT NULL REFERENCES achievement(id) ON DELETE CASCADE,
     unlocked_at     TEXT NOT NULL,
     UNIQUE (user_id, achievement_id)
   );`,

  // --- personal best: which day was the highest-XP day, per category ----------
  // (Updated on each completion; lets us show "Твой рекорд: 14 июля — 250 XP".)
  `CREATE TABLE IF NOT EXISTS personal_best (
     user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     scope        TEXT NOT NULL,            -- 'day' | 'category:<cat>'
     value        INTEGER NOT NULL,         -- total XP in scope
     achieved_at  TEXT NOT NULL,            -- ISO-8601 of the day/category PB
     PRIMARY KEY (user_id, scope)
   );`,
];
