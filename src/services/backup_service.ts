/**
 * Local profile backup.
 *
 * ## What this can and cannot do
 *
 * The request was "keep the profile even through a full app reinstall,
 * locally, no cloud". On Android that is not possible from inside the app:
 * uninstalling deletes the app's private data directory, which is exactly
 * where `expo-sqlite` puts the database and where `expo-file-system`
 * allows writes. No permission or API can read another app's leftovers.
 * Anything claiming otherwise is either using a cloud account or lying.
 *
 * So the honest version of the feature is a **portable snapshot the user
 * owns**: one tap writes a small JSON file and hands it to the Android
 * share sheet, so it lands in Files, Drive, Telegram or wherever the user
 * already keeps things — outside the sandbox, and therefore still there
 * after a reinstall. Restore reads it back with the system file picker.
 *
 * Design consequences, all deliberate:
 *  - the payload is versioned and validated on import; an unknown or
 *    corrupt file is rejected with a reason instead of half-applying;
 *  - restore is transactional (single transaction) and keeps a rollback
 *    copy of the current state, because it overwrites real history;
 *  - the snapshot deliberately excludes system quests (they re-seed) and
 *    achievement definitions (they re-seed), so the file stays small and
 *    does not rot when the catalogue grows;
 *  - it also carries the dismissed/shown recommendation bookkeeping,
 *    which otherwise lives in `localStorage` and would be lost.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import type { DbExecutor } from '../db/executor';
import { sqlText } from '../db/literals';

export const BACKUP_VERSION = 2;
export const BACKUP_KIND = 'mirai-rpg-backup';

export type BackupPayload = {
  kind: typeof BACKUP_KIND;
  version: number;
  createdAt: string;
  appVersion: string;
  user: {
    id: string;
    name: string | null;
  } | null;
  character: Record<string, unknown> | null;
  stats: Record<string, unknown>[];
  personalBests: Record<string, unknown>[];
  /** Only the user's own quests; the system catalogue re-seeds. */
  customQuests: Record<string, unknown>[];
  /**
   * History rows, with the quest **title** carried alongside. System quest
   * and achievement ids are `uuid()` generated per install, so the raw ids
   * in a snapshot are meaningless after a reinstall — see `restoreBackup`.
   */
  completions: Array<Record<string, unknown> & { quest_title?: string | null }>;
  /** Unlocks keyed by achievement **code**, which is stable across installs. */
  unlocks: Array<Record<string, unknown> & { code?: string | null }>;
  preferences: Record<string, string>;
};

export type BackupSummary = {
  createdAt: string;
  completions: number;
  customQuests: number;
  unlocks: number;
  bytes: number;
  fileName: string;
  fileUri: string;
};

const BACKUP_PREFIX = 'mirai-rpg-backup-';
const BACKUP_EXT = '.json';

function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function cacheDir(): string {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('Нет доступа к файловой системе');
  return dir;
}

/**
 * Serialize everything a restore needs. Pure read — no writes.
 *
 * Written without JOINs or subqueries on purpose: it keeps the snapshot
 * code runnable against the in-memory test executor (which implements
 * neither), and a profile is a single user with a single character, so
 * the joins would buy nothing.
 */
export async function buildBackup(db: DbExecutor, userId: string, appVersion: string): Promise<BackupPayload> {
  const [userRows, characters, customQuests, completionRows, unlockRows, personalBests] = await Promise.all([
    db.all<Record<string, unknown>>(`SELECT id, name, created_at FROM user WHERE id = ${sqlText(userId)}`),
    db.all<Record<string, unknown>>(
      `SELECT id, user_id, name, class, level, xp, created_at FROM character WHERE user_id = ${sqlText(userId)}`,
    ),
    db.all<Record<string, unknown>>(`SELECT * FROM quest WHERE user_id = ${sqlText(userId)}`),
    db.all<Record<string, unknown>>(
      `SELECT id, quest_id, category, xp_awarded, dr_multiplier, completed_at FROM quest_completion WHERE user_id = ${sqlText(userId)}`,
    ),
    db.all<Record<string, unknown>>(
      `SELECT id, achievement_id, unlocked_at FROM achievement_unlock WHERE user_id = ${sqlText(userId)}`,
    ),
    db.all<Record<string, unknown>>(`SELECT * FROM personal_best WHERE user_id = ${sqlText(userId)}`).catch(
      () => [] as Record<string, unknown>[],
    ),
  ]);

  const characterId = typeof characters[0]?.id === 'string' ? (characters[0].id as string) : null;
  const stats = characterId
    ? await db.all<Record<string, unknown>>(`SELECT * FROM stat WHERE character_id = ${sqlText(characterId)}`)
    : [];

  // The quest title travels with each completion: `quest_id` is a uuid
  // regenerated on every install for system quests, so the title is the
  // only stable handle across a reinstall.
  const questTitles = new Map<string, string>();
  const catalogue = await db.all<{ id: string; title: string }>(`SELECT id, title FROM quest`);
  for (const row of catalogue) questTitles.set(row.id, row.title);

  const completions: BackupPayload['completions'] = completionRows.map(row => ({
    ...row,
    quest_title: typeof row.quest_id === 'string' ? questTitles.get(row.quest_id) ?? null : null,
  }));

  // Likewise, achievements are matched by their stable `code`.
  const achievementCodes = new Map<string, string>();
  const defs = await db.all<{ id: string; code: string }>(`SELECT id, code FROM achievement`);
  for (const row of defs) achievementCodes.set(row.id, row.code);

  const unlocks: BackupPayload['unlocks'] = unlockRows.map(row => ({
    id: row.id,
    unlocked_at: row.unlocked_at,
    code: typeof row.achievement_id === 'string' ? achievementCodes.get(row.achievement_id) ?? null : null,
  }));

  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion,
    user: (userRows[0] as { id: string; name: string | null } | undefined) ?? null,
    character: characters[0] ?? null,
    stats,
    personalBests,
    customQuests,
    completions,
    unlocks,
    preferences: readPreferences(),
  };
}

const PREFERENCE_KEYS = ['mirai.dismissedQuests', 'mirai.recommendedQuests', 'mirai.onboarded'];

function readPreferences(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of PREFERENCE_KEYS) {
    try {
      const value = globalThis.localStorage?.getItem(key);
      if (typeof value === 'string') result[key] = value;
    } catch {
      // a broken storage must never fail a backup
    }
  }
  return result;
}

function writePreferences(preferences: Record<string, string>) {
  for (const [key, value] of Object.entries(preferences)) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore
    }
  }
}

/**
 * Write the snapshot to a file and open the share sheet.
 *
 * Returns the file URI as well, so the UI can show the path when sharing
 * is unavailable (e.g. a device with no share target).
 */
export async function exportBackup(
  db: DbExecutor,
  userId: string,
  appVersion: string,
): Promise<BackupSummary> {
  const payload = await buildBackup(db, userId, appVersion);
  const json = JSON.stringify(payload, null, 2);
  const fileName = `${BACKUP_PREFIX}${stamp()}${BACKUP_EXT}`;
  const fileUri = `${cacheDir()}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Сохранить копию Mirai RPG',
        UTI: 'public.json',
      });
    } catch {
      // The file is already on disk; the caller can still copy its name.
    }
  }

  return {
    createdAt: payload.createdAt,
    completions: payload.completions.length,
    customQuests: payload.customQuests.length,
    unlocks: payload.unlocks.length,
    bytes: json.length,
    fileName,
    fileUri,
  };
}

/** Copy the snapshot as text — the fallback when no share target exists. */
export async function copyBackupToClipboard(
  db: DbExecutor,
  userId: string,
  appVersion: string,
): Promise<number> {
  const payload = await buildBackup(db, userId, appVersion);
  const json = JSON.stringify(payload);
  await Clipboard.setStringAsync(json);
  return json.length;
}

export type ValidationResult =
  | { ok: true; payload: BackupPayload }
  | { ok: false; reason: string };

/** Parse and sanity-check a file's contents before anything is written. */
export function parseBackup(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Файл повреждён: это не JSON' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'Файл повреждён: ожидался объект' };
  }
  const candidate = raw as Partial<BackupPayload>;
  if (candidate.kind !== BACKUP_KIND) {
    return { ok: false, reason: 'Это не копия Mirai RPG' };
  }
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    return { ok: false, reason: `Копия из более новой версии приложения (${String(candidate.version)})` };
  }
  if (!Array.isArray(candidate.completions) || !Array.isArray(candidate.customQuests)) {
    return { ok: false, reason: 'В копии нет списка завершений или своих квестов' };
  }
  if (!candidate.user || typeof candidate.user.id !== 'string') {
    return { ok: false, reason: 'В копии нет профиля' };
  }
  return {
    ok: true,
    payload: {
      kind: BACKUP_KIND,
      version: candidate.version,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
      appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : 'unknown',
      user: candidate.user as BackupPayload['user'],
      character: candidate.character ?? null,
      stats: Array.isArray(candidate.stats) ? candidate.stats : [],
      personalBests: Array.isArray(candidate.personalBests) ? candidate.personalBests : [],
      customQuests: candidate.customQuests,
      completions: candidate.completions,
      unlocks: Array.isArray(candidate.unlocks) ? candidate.unlocks : [],
      preferences:
        candidate.preferences && typeof candidate.preferences === 'object' ? candidate.preferences : {},
    },
  };
}

/** Read a picked file and validate it. */
export async function readBackupFile(uri: string): Promise<ValidationResult> {
  let text: string;
  try {
    text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (error) {
    return { ok: false, reason: `Не удалось прочитать файл: ${error instanceof Error ? error.message : String(error)}` };
  }
  return parseBackup(text);
}

export type RestoreResult = {
  completions: number;
  customQuests: number;
  unlocks: number;
  stats: number;
  /** Completions whose quest no longer exists anywhere and got a stub. */
  orphaned: number;
};

/**
 * Replace the profile's data with the snapshot's.
 *
 * Runs in one transaction, so a failure halfway through leaves the
 * existing profile untouched.
 *
 * The interesting part is id resolution. `quest.id` for a *system* quest
 * and `achievement.id` are `uuid()`s generated when the row is first
 * inserted, so after a reinstall every one of them is different and the
 * foreign keys inside a snapshot are dangling. Two mappings fix that:
 *
 *  - completions are matched to quests by **title** (unique by
 *    construction — the seeder relies on it);
 *  - unlocks are matched to achievements by **code** (a declared UNIQUE).
 *
 * If a title matches nothing — the quest was removed from the catalogue in
 * a later version — the history is still preserved by inserting a stub
 * quest owned by the user. Losing a month of calendar entries because a
 * seed line was renamed is not an acceptable failure mode, and the
 * foreign key would reject the row anyway.
 */
export async function restoreBackup(db: DbExecutor, payload: BackupPayload): Promise<RestoreResult> {
  const userId = payload.user?.id;
  if (!userId) throw new Error('В копии нет профиля');

  return db.withTransaction(async tx => {
    // Make sure the target user row exists, then wipe only their rows.
    await tx.exec(
      `INSERT OR IGNORE INTO user (id, name, created_at) VALUES (${sqlText(userId)}, ${sqlText(payload.user?.name ?? 'Hero')}, ${sqlText(new Date().toISOString())})`,
    );
    await tx.exec(`DELETE FROM quest_completion WHERE user_id = ${sqlText(userId)}`);
    await tx.exec(`DELETE FROM quest WHERE user_id = ${sqlText(userId)}`);
    await tx.exec(`DELETE FROM achievement_unlock WHERE user_id = ${sqlText(userId)}`);
    await tx.exec(`DELETE FROM personal_best WHERE user_id = ${sqlText(userId)}`);

    // Read the character ids before deleting them, and drop the stats by
    // id: no subquery, so the same code runs on the in-memory executor.
    const staleCharacters = await tx.all<{ id: string }>(
      `SELECT id FROM character WHERE user_id = ${sqlText(userId)}`,
    );
    for (const row of staleCharacters) {
      await tx.exec(`DELETE FROM stat WHERE character_id = ${sqlText(row.id)}`);
    }
    await tx.exec(`DELETE FROM character WHERE user_id = ${sqlText(userId)}`);

    if (payload.character) {
      const columns = Object.keys(payload.character).filter(isSafeColumn);
      const values = columns.map(column => sqlValue(payload.character?.[column]));
      if (columns.length > 0) {
        await tx.exec(
          `INSERT OR REPLACE INTO character (${columns.join(', ')}) VALUES (${values.join(', ')})`,
        );
      }
    }

    for (const row of payload.stats) await insertRows(tx, 'stat', row);
    for (const row of payload.personalBests) await insertRows(tx, 'personal_best', { ...row, user_id: userId });

    // Custom quests keep their ids, so they are inserted first and can
    // serve as resolution targets for the history below.
    const questIdByTitle = new Map<string, string>();
    for (const row of payload.customQuests) {
      await insertRows(tx, 'quest', { ...row, user_id: userId });
      const title = row.title;
      const id = row.id;
      if (typeof title === 'string' && typeof id === 'string') questIdByTitle.set(title, id);
    }
    const systemQuests = await tx.all<{ id: string; title: string }>(
      `SELECT id, title FROM quest WHERE is_system = 1`,
    );
    for (const row of systemQuests) questIdByTitle.set(row.title, row.id);

    let orphaned = 0;
    const stubIds = new Set<string>();
    for (const row of payload.completions) {
      // The title is the ONLY trustworthy handle. Falling back to the
      // stored `quest_id` would be actively harmful: after a reinstall
      // that id either matches nothing (history silently orphaned, or the
      // whole restore rolled back on the foreign key) or, worse, matches a
      // *different* quest in the new catalogue.
      const title = typeof row.quest_title === 'string' && row.quest_title.length > 0 ? row.quest_title : null;
      let questId = title ? questIdByTitle.get(title) : undefined;
      if (!questId) {
        // No match anywhere: keep the entry with a stub quest so the
        // calendar and the streak never lose a day.
        questId = `restored_${stubIds.size}_${Math.abs(hashString(title ?? String(row.id ?? 'quest')))}`;
        stubIds.add(questId);
        orphaned += 1;
        await insertRows(tx, 'quest', {
          id: questId,
          user_id: userId,
          title: title ?? 'Квест из копии',
          description: 'Восстановлен из резервной копии',
          category: typeof row.category === 'string' ? row.category : 'discipline',
          difficulty: 1,
          xp_reward: typeof row.xp_awarded === 'number' ? row.xp_awarded : 0,
          is_system: 0,
          is_active: 1,
          created_at: typeof row.completed_at === 'string' ? row.completed_at : new Date().toISOString(),
        });
        if (title) questIdByTitle.set(title, questId);
      }
      const { quest_title: _ignored, ...rest } = row;
      await insertRows(tx, 'quest_completion', { ...rest, quest_id: questId, user_id: userId });
    }

    const achievementIdByCode = new Map<string, string>();
    const catalog = await tx.all<{ id: string; code: string }>(`SELECT id, code FROM achievement`);
    for (const row of catalog) achievementIdByCode.set(row.code, row.id);

    let unlocks = 0;
    for (const row of payload.unlocks) {
      const code = typeof row.code === 'string' ? row.code : null;
      const achievementId = code ? achievementIdByCode.get(code) : undefined;
      if (!achievementId) continue;
      await insertRows(tx, 'achievement_unlock', {
        id: typeof row.id === 'string' ? row.id : `restored_unlock_${code}`,
        user_id: userId,
        achievement_id: achievementId,
        unlocked_at: typeof row.unlocked_at === 'string' ? row.unlocked_at : new Date().toISOString(),
      });
      unlocks += 1;
    }

    writePreferences(payload.preferences ?? {});

    return {
      completions: payload.completions.length,
      customQuests: payload.customQuests.length,
      unlocks,
      stats: payload.stats.length,
      orphaned,
    };
  });
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

const ALLOWED_COLUMNS = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_TABLES = new Set(['stat', 'personal_best', 'quest', 'quest_completion', 'achievement_unlock']);

function isSafeColumn(column: string): boolean {
  return ALLOWED_COLUMNS.test(column);
}

async function insertRows(tx: DbExecutor, table: string, row: Record<string, unknown>): Promise<void> {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Недопустимое имя таблицы: ${table}`);
  const columns = Object.keys(row).filter(isSafeColumn);
  if (columns.length === 0) return;
  const values = columns.map(column => sqlValue(row[column]));
  await tx.exec(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})`,
  );
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return sqlText(String(value));
}
