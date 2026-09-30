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
   * The Downloads copy goes through the Storage Access Framework, because the
   * log says plainly why a plain path cannot work on a modern target:
   *
   *   java.io.IOException: Location '/sdcard/Download/' isn't writable.
   *
   * No permission changes that - `WRITE_EXTERNAL_STORAGE` is a no-op from
   * Android 10 on, and `requestLegacyExternalStorage` is ignored above target
   * 29. SAF is the platform's own answer: the user grants a folder once and
   * every write after that is an ordinary write.
   */
  test('a grant writes the log into the granted folder', async () => {
    const fs = require('expo-file-system');
    fs.StorageAccessFramework = {
      getUriForDirectoryInRoot: jest.fn((name: string) => `content://tree/${name}`),
      requestDirectoryPermissionsAsync: jest.fn(async () => ({
        granted: true,
        directoryUri: 'content://tree/primary:Download',
      })),
      readDirectoryAsync: jest.fn(async () => []),
      createFileAsync: jest.fn(async () => 'content://tree/primary:Download/mirai-rpg.log'),
      writeAsStringAsync: jest.fn(async () => undefined),
    };
    const { logCheckpoint, grantLogFolder, readDiagnostics } = require('../src/ui/logging');
    logCheckpoint('home', 'load done');

    const result = await grantLogFolder();

    expect(result.ok).toBe(true);
    expect(fs.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      'content://tree/primary:Download',
      'mirai-rpg.log',
      'text/plain',
    );
    expect(fs.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalled();
    expect(readDiagnostics()).toContain('created in Downloads');
  });

  test('a refused grant is reported and never throws', async () => {
    const fs = require('expo-file-system');
    fs.StorageAccessFramework = {
      getUriForDirectoryInRoot: jest.fn(() => 'content://tree/Download'),
      requestDirectoryPermissionsAsync: jest.fn(async () => ({ granted: false })),
      readDirectoryAsync: jest.fn(async () => []),
      createFileAsync: jest.fn(),
      writeAsStringAsync: jest.fn(),
    };
    const { grantLogFolder, readDiagnostics } = require('../src/ui/logging');
    const result = await grantLogFolder();
    expect(result.ok).toBe(false);
    expect(readDiagnostics()).toContain('not granted yet');
  });

  test('the private copy is written whether or not a folder was granted', async () => {
    const fs = require('expo-file-system');
    fs.StorageAccessFramework = undefined;
    const { logCheckpoint } = require('../src/ui/logging');
    logCheckpoint('home', 'private copy regardless');
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    expect(mockWrites.some(w => w.path === 'file:///mock/mirai-rpg.log')).toBe(true);
  });

  test('an existing SAF file is rewritten, not duplicated', async () => {
    const fs = require('expo-file-system');
    const createFile = jest.fn();
    fs.StorageAccessFramework = {
      getUriForDirectoryInRoot: jest.fn(() => 'content://tree/Download'),
      requestDirectoryPermissionsAsync: jest.fn(async () => ({
        granted: true,
        directoryUri: 'content://tree/primary:Download',
      })),
      readDirectoryAsync: jest.fn(async () => [{ name: 'mirai-rpg.log', uri: 'content://existing' }]),
      createFileAsync: createFile,
      writeAsStringAsync: jest.fn(async () => undefined),
    };
    const { grantLogFolder } = require('../src/ui/logging');
    await grantLogFolder();
    expect(createFile).not.toHaveBeenCalled();
    expect(fs.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith('content://existing', expect.any(String));
  });

  /**
   * The share sheet is the other route out, and the one that needs no grant:
   * the file is written to the cache and handed to the system, which passes it
   * to wherever the user picks. It must still leave the file on disk when the
   * sheet is unavailable, because the diagnostics text names its path.
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
