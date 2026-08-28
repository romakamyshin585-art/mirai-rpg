/**
 * Циклическое логирование в файл. Каждое действие в приложении
 * попадает сюда автоматически (см. App.tsx — обёртка над Pressable).
 * Пользователь может дополнить лог вручную через экран «Сообщить».
 *
 * Хранилище: файл mirai_rpg.log в documentDirectory.
 * Ротация: при > MAX_BYTES переименовывается в .prev (1 файл архива).
 */

import * as FileSystem from 'expo-file-system';

const LOG_FILENAME = 'mirai_rpg.log';
const LOG_PREV_FILENAME = 'mirai_rpg.log.prev';
const MAX_BYTES = 256 * 1024; // 256 KB

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'ACTION' | 'USER';

export interface LogEntry {
  ts: string;            // ISO
  level: LogLevel;
  tag: string;           // модуль/экран, напр. "init", "QuestsScreen"
  msg: string;           // текст
  data?: unknown;        // структурированные данные (object → JSON)
  userNote?: string;     // заметка от пользователя (если была)
}

let memBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let inited = false;

// Перехватываем unhandled errors
function installGlobalHandlers(): void {
  // Promise rejection / window error (RN начиная с 0.65 поддерживает)
  if (typeof globalThis !== 'undefined') {
    const gt: any = globalThis;
    if (gt.addEventListener) {
      gt.addEventListener('unhandledrejection', (ev: any) => {
        log('ERROR', 'unhandledrejection', String(ev?.reason ?? ev));
      });
      gt.addEventListener('error', (ev: any) => {
        log('ERROR', 'window.error', String(ev?.message ?? ev));
      });
    }
  }
}

function ensureFile(): string {
  const base = FileSystem.documentDirectory ?? '';
  return base + LOG_FILENAME;
}

function ensurePrevFile(): string {
  const base = FileSystem.documentDirectory ?? '';
  return base + LOG_PREV_FILENAME;
}

async function rotateIfNeeded(): Promise<void> {
  const file = ensureFile();
  const info = await FileSystem.getInfoAsync(file);
  if (!info.exists) return;
  if (info.size && info.size > MAX_BYTES) {
    const prev = ensurePrevFile();
    try { await FileSystem.deleteAsync(prev, { idempotent: true }); } catch {}
    try { await FileSystem.moveAsync({ from: file, to: prev }); } catch {}
  }
}

async function flush(): Promise<void> {
  if (memBuffer.length === 0) return;
  const batch = memBuffer;
  memBuffer = [];
  await rotateIfNeeded();
  const file = ensureFile();
  const lines = batch
    .map(formatLine)
    .join('\n') + '\n';
  try {
    const existing = await FileSystem.readAsStringAsync(file, {
      encoding: 'utf8' as any,
    }).catch(() => '');
    const next = (existing ?? '') + lines;
    await FileSystem.writeAsStringAsync(file, next, {
      encoding: 'utf8' as any,
    });
  } catch (e) {
    // Если не получилось — вернём записи в буфер (best-effort)
    memBuffer = batch.concat(memBuffer);
  }
}

function formatLine(e: LogEntry): string {
  const dataStr = e.data !== undefined
    ? ' | data=' + safeJson(e.data)
    : '';
  const noteStr = e.userNote
    ? ' | user=' + e.userNote.replace(/\|/g, '/').replace(/\n/g, ' ')
    : '';
  return `${e.ts} [${e.level}] ${e.tag}: ${e.msg}${dataStr}${noteStr}`;
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v, (_k, val) => {
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (typeof val === 'function') return '[Function]';
      return val;
    });
    return s.length > 4000 ? s.slice(0, 4000) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

/** Публичный API. */
export function log(
  level: LogLevel,
  tag: string,
  msg: string,
  data?: unknown,
  userNote?: string,
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    tag,
    msg,
    data,
    userNote,
  };
  memBuffer.push(entry);
  // Дублируем в console (попадёт в logcat на Android)
  const line = formatLine(entry);
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
  // Жёсткий flush для ERROR — чтобы точно не потерялось
  if (level === 'ERROR') void flush();
}

export async function flushLogsNow(): Promise<void> {
  await flush();
}

export function initLogger(): void {
  if (inited) return;
  inited = true;
  installGlobalHandlers();
  // Консоль → лог
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    origLog(...args);
    if (args[0] && typeof args[0] === 'string' && args[0].startsWith('[MiraiRPG]')) {
      // свой лог уже записал
      return;
    }
    log('INFO', 'console', args.map(stringifyArg).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    log('WARN', 'console', args.map(stringifyArg).join(' '));
  };
  console.error = (...args: unknown[]) => {
    origErr(...args);
    log('ERROR', 'console', args.map(stringifyArg).join(' '));
    void flush();
  };
  // Периодический flush каждые 3 секунды
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => { void flush(); }, 3000);
  log('INFO', 'logger', 'Logger initialised');
}

function stringifyArg(a: unknown): string {
  if (a == null) return String(a);
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.message + '\n' + (a.stack ?? '');
  try { return JSON.stringify(a); } catch { return String(a); }
}

/** Возвращает последние N строк лога (хвост). */
export async function tailLogs(maxLines = 500): Promise<string> {
  await flush();
  const file = ensureFile();
  const prev = ensurePrevFile();
  const cur = await FileSystem.readAsStringAsync(file, { encoding: 'utf8' as any }).catch(() => '');
  const arc = await FileSystem.readAsStringAsync(prev, { encoding: 'utf8' as any }).catch(() => '');
  const all = (arc ?? '') + (cur ?? '');
  const lines = all.split('\n').filter(Boolean);
  return lines.slice(-maxLines).join('\n');
}

/** Полный лог + meta. Возвращает имя файла, куда сохранено (для share). */
export async function exportLogsAsFile(): Promise<string> {
  await flush();
  const file = ensureFile();
  const prev = ensurePrevFile();
  const cur = await FileSystem.readAsStringAsync(file, { encoding: 'utf8' as any }).catch(() => '');
  const arc = await FileSystem.readAsStringAsync(prev, { encoding: 'utf8' as any }).catch(() => '');
  const exportFile = (FileSystem.documentDirectory ?? '') + 'mirai_rpg_export.txt';
  const header = [
    '=== Mirai RPG diagnostic export ===',
    'Generated: ' + new Date().toISOString(),
    'App version: ' + (process.env.EXPO_OS ?? 'unknown'),
    '',
    '=== Current log ===',
    '',
  ].join('\n');
  const sep = '\n\n=== Archived log (rotated) ===\n\n';
  const body = (arc ?? '') + sep + (cur ?? '');
  await FileSystem.writeAsStringAsync(exportFile, header + body, { encoding: 'utf8' as any });
  return exportFile;
}

/** Добавить пользовательскую заметку в лог (с экрана «Сообщить»). */
export function addUserNote(note: string, extra?: { tag?: string; data?: unknown }): void {
  if (!note.trim()) return;
  log('USER', extra?.tag ?? 'user', 'User note', extra?.data, note.trim());
  void flush();
}
