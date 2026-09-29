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
    `log file: ${logFilePath() ?? 'unavailable'}`,
    '',
    'LAST LINES BEFORE THE PROBLEM',
    stuck,
    '',
    readLogText(),
  ].join('\n');
}
