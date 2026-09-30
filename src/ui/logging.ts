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
 * Where a copy is written so the user can reach it without root.
 *
 * Order matters, and the first one is the point of all this. The app's private
 * directory is unreadable by any file manager, and the failure being chased
 * freezes the app on its very first screen - so the log has to be sitting in a
 * folder the user can open *before* they think to look, without launching
 * anything.
 *
 *  - Download: visible in every file manager, in the Downloads app, over USB
 *    without root. Needs legacy external storage on Android 10, which the build
 *    now requests - with it off, the OS refused the write and the catch
 *    swallowed it, which is why 0.4.7 produced no folder at all.
 *  - Android/data: the app-specific external folder. Free to write, but some
 *    OEM skins hide it from file managers, so it is a second copy, not the
 *    first.
 */
const VISIBLE_TARGETS: { label: string; dir: string }[] = [
  { label: 'Download', dir: '/sdcard/Download/' },
  { label: 'Android/data', dir: '/sdcard/Android/data/com.mirai.rpg/files/' },
];

const results: Record<string, string> = {};

async function writeVisibleCopies(): Promise<void> {
  const body = serialise();
  for (const target of VISIBLE_TARGETS) {
    const path = `${target.dir}${FILE_NAME}`;
    try {
      const info = await (FileSystem as any).getInfoAsync(target.dir);
      if (!info.exists) await (FileSystem as any).makeDirectoryAsync(target.dir, { intermediates: true });
      await FileSystem.writeAsStringAsync(path, body);
      results[target.label] = `written (${path})`;
    } catch (error) {
      results[target.label] = `refused: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
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
  void writeVisibleCopies();
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
  void writeVisibleCopies();
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
    ...VISIBLE_TARGETS.map(target => `visible copy [${target.label}]: ${results[target.label] ?? 'not attempted'}`),
    `safe start check: ${lastSessionDiedInsideHome() ? 'the last session stopped inside Home' : 'the last session ended normally'}`,
    '',
    'LAST LINES BEFORE THE PROBLEM',
    stuck,
    '',
    readLogText(),
  ].join('\n');
}
