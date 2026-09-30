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
let lastWrite = 0;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let logPath: string | null = null;
let lastUncaughtError: string | null = null;

function logDirectory(): string | null {
  const dir = (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory ?? null;
  return typeof dir === 'string' ? dir : null;
}

/**
 * A second copy, somewhere a file manager can actually see.
 *
 * `documentDirectory` is the app's private directory - on Android it lives
 * under /data/data/<package>/, which no file manager may read without root,
 * which is why "where is the com.mirai.rpg folder" has no answer and searching
 * for it finds nothing. It is not hidden, it is unreachable.
 *
 * The app-specific *external* directory is different: the owning app may
 * always write there without a single permission, and on Android 10 - which is
 * what this phone runs - it is visible in the stock file manager and in Total
 * Commander. So the log lands there too, and the user can copy the file out and
 * attach it, with no PC, no USB debugging and no clipboard round trip.
 *
 * Best effort by design: a phone that refuses the write still gets the private
 * copy, and the in-app button still works.
 */
const EXTERNAL_DIR = '/sdcard/Android/data/com.mirai.rpg/files/';
const EXTERNAL_FILE = `${EXTERNAL_DIR}${FILE_NAME}`;

/** Whether the external copy actually made it, so a report can say so. */
let externalWriteOk: boolean | null = null;

async function writeExternalCopy(): Promise<void> {
  try {
    const info = await (FileSystem as any).getInfoAsync(EXTERNAL_DIR);
    if (!info.exists) await (FileSystem as any).makeDirectoryAsync(EXTERNAL_DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(EXTERNAL_FILE, serialise());
    externalWriteOk = true;
  } catch {
    // Not fatal: the private copy is the authoritative one, and sharing the
    // file does not depend on this at all.
    externalWriteOk = false;
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
      lines = previousLines.map(line => {
        const [at = '', ...rest] = line.split(/\s{2,}/);
        return { at, tag: 'previous', text: rest.join('  ') };
      });
    }
  } catch {
    // ignore
  }
  logEvent('app', `log opened at v${readAppVersion()}`);
  // Written at startup, not only on the next checkpoint: a user who installs
  // and goes straight to the file manager to look for the log must find one.
  void writeNow();
  void writeExternalCopy();
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
  void writeExternalCopy();
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
    `visible copy: ${EXTERNAL_FILE} (${externalWriteOk === null ? 'not attempted' : externalWriteOk ? 'written' : 'write refused by the OS'})`,
    '',
    'LAST LINES BEFORE THE PROBLEM',
    stuck,
    '',
    readLogText(),
  ].join('\n');
}
