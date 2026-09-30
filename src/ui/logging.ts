/**
 * Rolling on-disk log.
 *
 * Written because the failure this app keeps hitting cannot be debugged from
 * memory: the reported symptom is a frozen, blank window that only appears
 * once a quest has been completed, and if the JS thread is blocked then
 * anything buffered in RAM is lost along with everything else. A file that is
 * appended to as the app runs survives exactly that, because its last line is
 * the last thing that happened before the freeze.
 *
 * The file is capped and trimmed, and written at most every few hundred
 * milliseconds, so a long session cannot fill the device. Every line is also
 * echoed to `console.log`, so `adb logcat` sees the same stream.
 */

import * as FileSystem from 'expo-file-system';

const MAX_LINES = 4000;
const MIN_WRITE_INTERVAL_MS = 400;
const FILE_NAME = 'mirai-rpg.log';

type Entry = { at: string; tag: string; text: string };

let lines: Entry[] = [];
let restoredCount = 0;
let lastWrite = 0;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let logPath: string | null = null;
let lastUncaughtError: string | null = null;

function logDirectory(): string | null {
  const dir = (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory ?? null;
  return typeof dir === 'string' ? dir : null;
}

/**
 * Saving the log where the user can actually open it.
 *
 * Written after the log said, twice, that it was not there:
 *
 *   java.io.IOException: Location '/sdcard/Download/' isn't writable.
 *   java.io.IOException: Location '/sdcard/Android/data/com.mirai.rpg/files/' isn't writable.
 *
 * That is Android's scoped storage, and no permission fixes it. The app targets
 * a modern SDK, so from Android 10 on, a plain path write into shared storage
 * is refused by the OS - `WRITE_EXTERNAL_STORAGE` is a no-op there, and
 * `requestLegacyExternalStorage` is ignored for any target above 29. Guessing
 * at paths and hoping is what produced two builds with no file.
 *
 * So this uses the platform's own mechanism instead of fighting it. The
 * Storage Access Framework hands the app a real handle to a folder the user
 * picks, and every write after that grant is an ordinary write to a directory
 * the app legitimately owns. One confirmation, once, and the log then lands in
 * Downloads on its own.
 *
 * The private copy is still written first and unconditionally: it needs no
 * grant and is the one that survives if the user never taps the button.
 */
const SAF_FOLDER = 'Download';

const results: Record<string, string> = {};

function saf(): any {
  return (FileSystem as any).StorageAccessFramework ?? null;
}

/**
 * Ask once, then reuse. The grant is persisted by Android, so this is a no-op
 * on every launch after the first.
 */
async function requestSafDirectory(): Promise<string | null> {
  const api = saf();
  if (!api) return null;
  try {
    // The Downloads tree URI, so the system picker opens there rather than at
    // an arbitrary folder.
    const initial = api.getUriForDirectoryInRoot(SAF_FOLDER);
    const permissions = await api.requestDirectoryPermissionsAsync(initial);
    if (!permissions || !permissions.granted || !permissions.directoryUri) {
      results[`SAF ${SAF_FOLDER}`] = 'not granted yet - the app has no folder handle';
      return null;
    }
    results[`SAF ${SAF_FOLDER}`] = `granted (${permissions.directoryUri})`;
    return permissions.directoryUri;
  } catch (error) {
    results[`SAF ${SAF_FOLDER}`] = `unavailable: ${error instanceof Error ? error.message : String(error)}`;
    return null;
  }
}

/** One file, rewritten in place - SAF has no append and no in-place write. */
async function writeSafCopy(body: string): Promise<void> {
  const api = saf();
  if (!api) {
    results[`SAF ${SAF_FOLDER}`] = 'not available in this build of expo-file-system';
    return;
  }
  const directoryUri = (await ensureSafDirectory()) ?? null;
  if (!directoryUri) return;

  const fileName = FILE_NAME;
  try {
    const existing = await api.readDirectoryAsync(directoryUri);
    const match = (existing ?? []).find((entry: any) => entry?.name === fileName);
    if (match?.uri) {
      await api.writeAsStringAsync(match.uri, body);
      results[`SAF ${SAF_FOLDER}`] = `rewritten (${match.uri})`;
      return;
    }
    const created = await api.createFileAsync(directoryUri, fileName, 'text/plain');
    await api.writeAsStringAsync(created, body);
    results[`SAF ${SAF_FOLDER}`] = `created in Downloads (${created})`;
  } catch (error) {
    results[`SAF ${SAF_FOLDER}`] = `write failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

let safDirectory: string | null = null;
let safAttempted = false;

async function ensureSafDirectory(): Promise<string | null> {
  if (safDirectory) return safDirectory;
  if (safAttempted) return null;
  safAttempted = true;
  safDirectory = await requestSafDirectory();
  return safDirectory;
}

/**
 * Used by the diagnostics sheet: the grant has to be requested from a user
 * gesture, so it cannot live in the background write path.
 */
export async function grantLogFolder(): Promise<{ ok: boolean; detail: string }> {
  safAttempted = false;
  const directoryUri = await requestSafDirectory();
  if (!directoryUri) {
    return { ok: false, detail: results[`SAF ${SAF_FOLDER}`] ?? 'no folder handle' };
  }
  safDirectory = directoryUri;
  await writeSafCopy(serialise());
  return { ok: true, detail: results[`SAF ${SAF_FOLDER}`] ?? 'granted' };
}

export function logFilePath(): string | null {
  if (logPath) return logPath;
  const dir = logDirectory();
  if (!dir) return null;
  logPath = `${dir}${FILE_NAME}`;
  return logPath;
}

function format(entry: Entry): string {
  return `${entry.at}  ${entry.tag.padEnd(14, ' ')}  ${entry.text}`;
}

function serialise(): string {
  return lines.map(format).join('\n');
}

async function writeNow(): Promise<void> {
  const path = logFilePath();
  if (!path) return;
  try {
    await FileSystem.writeAsStringAsync(path, serialise());
    lastWrite = Date.now();
  } catch {
    // A log that cannot be written must never break the app it is describing.
  }
}

function scheduleWrite(): void {
  if (writeTimer) return;
  const since = Date.now() - lastWrite;
  const delay = since >= MIN_WRITE_INTERVAL_MS ? 0 : MIN_WRITE_INTERVAL_MS - since;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void writeNow();
  }, delay);
}

/** Restore the previous session's log, so a crash is visible after a restart. */
export async function initLogging(): Promise<void> {
  const path = logFilePath();
  if (!path) return;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const previous = await FileSystem.readAsStringAsync(path);
      const previousLines = previous.split('\n').filter(Boolean).slice(-250);
      // Restored verbatim, tags intact - the safe-start check reads them. The
      // split is by the two-space separator the formatter writes, so a line
      // with a free-text tail still lands in the right bucket.
      lines = previousLines.map(line => {
        const parts = line.split(/\s{2,}/);
        const at = parts[0] ?? '';
        const tag = (parts[1] ?? 'previous').trim();
        const text = parts.slice(2).join('  ').trim();
        return { at, tag, text };
      });
      restoredCount = lines.length;
    }
  } catch {
    // ignore
  }
  logEvent('app', `log opened at v${readAppVersion()}`);
  // Written at startup, not only on the next checkpoint: a user who installs
  // and goes straight to the file manager to look for the log must find one.
  void writeNow();
  void writeSafCopy(serialise());
}

/**
 * Put the log in the cache directory and hand it to the system share sheet.
 *
 * This is the path that cannot be defeated by Android's storage rules. The
 * private directory is unreadable without root; the app-specific external
 * directory is at the mercy of the OEM, and on this phone the write silently
 * did not happen at all. The share sheet sidesteps both: the user picks where
 * it goes, and the system grants access for that one file.
 *
 * Same mechanism the backup export already uses, so it is known to work on
 * this build.
 */
export async function shareLog(): Promise<{ shared: boolean; fileName: string; fileUri: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `mirai-rpg-log-${stamp}.txt`;
  const dir = (FileSystem as any).cacheDirectory ?? logDirectory();
  const fileUri = `${dir}${fileName}`;

  if (!dir) return { shared: false, fileName, fileUri: '' };

  await FileSystem.writeAsStringAsync(fileUri, readDiagnostics(), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return { shared: false, fileName, fileUri };
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/plain',
      dialogTitle: 'Отправить лог Mirai RPG',
      UTI: 'public.plain-text',
    });
    return { shared: true, fileName, fileUri };
  } catch {
    // The file is written either way; the caller can fall back to the
    // clipboard, and the path is in the diagnostics text.
    return { shared: false, fileName, fileUri };
  }
}

function readAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { APP_VERSION } = require('../app_version') as { APP_VERSION: string };
    return APP_VERSION;
  } catch {
    return '?';
  }
}

export function logEvent(tag: string, text: string): void {
  const entry: Entry = { at: new Date().toISOString(), tag, text };
  lines.push(entry);
  if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
  // eslint-disable-next-line no-console
  console.log(`[MiraiRPG] ${tag}: ${text}`);
  scheduleWrite();
}

/**
 * Log a line and flush immediately. For the breadcrumbs that bracket a step
 * the user will notice failing - the last of these on disk is the answer to
 * "where did it stop".
 */
export function logCheckpoint(tag: string, text: string): void {
  logEvent(tag, text);
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  void writeNow();
  void writeSafCopy(serialise());
}

export function setUncaughtForLog(detail: string): void {
  lastUncaughtError = detail;
  logCheckpoint('uncaught', detail);
}

export function readLogText(): string {
  const header = [
    `# Mirai RPG diagnostic log`,
    `# exported ${new Date().toISOString()}`,
    lastUncaughtError ? `# last uncaught: ${lastUncaughtError}` : '# last uncaught: none recorded',
    '',
  ].join('\n');
  return `${header}${serialise()}\n`;
}

/**
 * Did the previous session die inside Home?
 *
 * The failure being chased takes the app down on its very first screen, so
 * every in-app route to the log is unreachable exactly when it is needed: the
 * app opens on Home, Home is what kills it, and the user cannot even switch
 * tabs to reach the diagnostics. So the app has to notice by itself and start
 * somewhere else.
 *
 * It does not need a flag for this. `initLogging` already restores the tail of
 * the previous session, so the question is answerable from the log itself: if
 * the last thing the old session said was a Home checkpoint that is not a
 * completed load, then that is where it stopped. A session that died on another
 * tab ends with that tab's line, or with an app-level line, and is left alone -
 * which is why this is a check on the log rather than a boolean that has to be
 * maintained by hand at two points in the code.
 *
 * No storage is involved, deliberately: React Native has no localStorage, so a
 * flag kept there would silently never persist.
 */
export function lastSessionDiedInsideHome(): boolean {
  const restored = lines.slice(0, restoredCount);
  if (restored.length === 0) return false;
  const last = restored[restored.length - 1];
  return last.tag === 'home' && !/load done/.test(last.text);
}

/** Everything the app knows about its own health, for a bug report. */
export function readDiagnostics(): string {
  const stuck = lines
    .slice(-12)
    .map(format)
    .join('\n');
  return [
    'MIRAI RPG DIAGNOSTICS',
    `exported: ${new Date().toISOString()}`,
    `app version: ${readAppVersion()}`,
    `lines kept: ${lines.length}`,
    `last uncaught: ${lastUncaughtError ?? 'none recorded'}`,
    `private log: ${logFilePath() ?? 'unavailable'}`,
    `Downloads (SAF): ${results[`SAF ${SAF_FOLDER}`] ?? 'never attempted - press "Allow writing to Downloads" in Diagnostics'}`,
    `safe start check: ${lastSessionDiedInsideHome() ? 'the last session stopped inside Home' : 'the last session ended normally'}`,
    '',
    'LAST LINES BEFORE THE PROBLEM',
    stuck,
    '',
    readLogText(),
  ].join('\n');
}
