/**
 * The logger has to earn its place. Three things it must do, none of which a
 * device test can confirm:
 *
 *  - buffer lines in order and cap itself,
 *  - flush to disk, because the failure it exists for takes the window with it
 *    and anything in RAM dies with the process,
 *  - read the previous session back, so a crash is still visible after a
 *    restart - which is when the user is asked about it.
 */

const mockWrites: { path: string; contents: string }[] = [];
let mockHasPrevious = false;

jest.mock('expo-file-system', () => ({
  get documentDirectory() {
    return 'file:///mock/';
  },
  get cacheDirectory() {
    return 'file:///mock/cache/';
  },
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: jest.fn(async (path: string, contents: string) => {
    mockWrites.push({ path, contents });
  }),
  readAsStringAsync: jest.fn(async () => (mockHasPrevious ? 'PREV  old-session-line\nPREV  another' : '')),
  getInfoAsync: jest.fn(async () => ({ exists: mockHasPrevious })),
  makeDirectoryAsync: jest.fn(async () => undefined),
}));

describe('rolling on-disk log', () => {
  beforeEach(() => {
    jest.resetModules();
    mockWrites.length = 0;
    mockHasPrevious = false;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('writes breadcrumbs to disk in order', async () => {
    const { logEvent, logCheckpoint } = require('../src/ui/logging');
    logCheckpoint('home', 'load start');
    logEvent('home', 'queries done');
    logCheckpoint('home', 'load done');
    await Promise.resolve();
    await Promise.resolve();

    const last = mockWrites[mockWrites.length - 1];
    expect(last.path).toContain('mirai-rpg.log');
    const order = last.contents
      .split('\n')
      .map((line: string) => /(load start|queries done|load done)/.exec(line)?.[1])
      .filter(Boolean);
    expect(order).toEqual(['load start', 'queries done', 'load done']);
  });

  test('caps the buffer instead of growing without bound', async () => {
    const { logEvent, readLogText } = require('../src/ui/logging');
    for (let i = 0; i < 4200; i += 1) logEvent('bulk', `line ${i}`);
    const text = readLogText();
    const kept = text.split('\n').filter((line: string) => line.includes('bulk')).length;
    expect(kept).toBeLessThanOrEqual(4000);
    // The newest line is always kept, the oldest is dropped.
    expect(text).toContain('line 4199');
    expect(text).not.toContain('line 5 ');
  });

  test('a previous session is restored on start', async () => {
    mockHasPrevious = true;
    const { initLogging, readLogText } = require('../src/ui/logging');
    await initLogging();
    expect(readLogText()).toContain('old-session-line');
  });

  test('the export names the version and the last uncaught error', async () => {
    const { logEvent, setUncaughtForLog, readDiagnostics } = require('../src/ui/logging');
    setUncaughtForLog('TypeError: something went wrong');
    logEvent('home', 'a line');
    const dump = readDiagnostics();
    expect(dump).toContain('MIRAI RPG DIAGNOSTICS');
    expect(dump).toContain('TypeError: something went wrong');
    expect(dump).toMatch(/app version: 0\.4\.\d+/);
    expect(dump).toContain('a line');
  });

  test('a log that cannot be written never throws into the app', async () => {
    const fs = require('expo-file-system');
    fs.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
    const { logCheckpoint } = require('../src/ui/logging');
    expect(() => logCheckpoint('home', 'still fine')).not.toThrow();
    await Promise.resolve();
  });

  /**
   * The whole point of the second copy. `documentDirectory` is unreadable by
   * any file manager without root, so the user cannot reach the log that way;
   * the app-specific external directory is the one place on Android 10 that a
   * file manager can actually open, and the app may write it with no
   * permission at all.
   */
  test('a copy lands in the external folder a file manager can open', async () => {
    const { logCheckpoint } = require('../src/ui/logging');
    logCheckpoint('home', 'load done');
    // Two visible targets now, each an await chain of its own, so this has to
    // let the microtask queue drain rather than tick a fixed twice.
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    const visible = mockWrites.filter(w => w.path.startsWith('/sdcard/'));
    expect(visible.length).toBeGreaterThanOrEqual(2);
    // Download is the one a file manager on Android 10 can always be relied on
    // to show, so it is the one that matters.
    const download = visible.find(w => w.path.startsWith('/sdcard/Download/'));
    expect(download).toBeDefined();
    expect(download!.path.endsWith('mirai-rpg.log')).toBe(true);
    expect(download!.contents).toContain('load done');
  });

  test('a refused visible write leaves the private copy intact', async () => {
    const fs = require('expo-file-system');
    fs.makeDirectoryAsync = jest.fn(async () => {
      throw new Error('EACCES');
    });
    fs.getInfoAsync = jest.fn(async () => ({ exists: false }));
    const { logCheckpoint, readDiagnostics } = require('../src/ui/logging');
    expect(() => logCheckpoint('home', 'private still written')).not.toThrow();
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    expect(mockWrites.some(w => w.path === 'file:///mock/mirai-rpg.log')).toBe(true);
    expect(readDiagnostics()).toContain('refused');
  });

  /**
   * The share path is the one that cannot be defeated by storage rules: the
   * private directory needs root, and on this phone the external write was
   * refused outright. The file must land in the cache and be handed to the
   * share sheet - and if the sheet is unavailable the file still has to exist,
   * because the diagnostics text names its path.
   */
  test('the log is written as a file and handed to the share sheet', async () => {
    jest.mock('expo-sharing', () => ({
      isAvailableAsync: jest.fn(async () => true),
      shareAsync: jest.fn(async () => undefined),
    }));
    const Sharing = require('expo-sharing');
    const { logEvent, shareLog } = require('../src/ui/logging');
    logEvent('home', 'a distinctive line for the report');

    const result = await shareLog();

    expect(result.shared).toBe(true);
    expect(result.fileName).toMatch(/^mirai-rpg-log-.*\.txt$/);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      result.fileUri,
      expect.objectContaining({ mimeType: 'text/plain' }),
    );
    const written = mockWrites.find(w => w.path === result.fileUri);
    expect(written).toBeDefined();
    expect(written!.contents).toContain('MIRAI RPG DIAGNOSTICS');
    expect(written!.contents).toContain('a distinctive line for the report');
  });

  test('a refused share sheet still leaves the file on disk', async () => {
    jest.mock('expo-sharing', () => ({
      isAvailableAsync: jest.fn(async () => true),
      shareAsync: jest.fn(async () => {
        throw new Error('no target');
      }),
    }));
    const { shareLog } = require('../src/ui/logging');
    const result = await shareLog();
    expect(result.shared).toBe(false);
    expect(mockWrites.some(w => w.path === result.fileUri)).toBe(true);
  });
});
