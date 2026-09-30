/**
 * Detecting a session that died inside Home.
 *
 * The failure this exists for takes the app down on its very first screen, so
 * every in-app route to the log is unreachable at the moment it is needed: the
 * app opens on Home, Home is what kills it, and the user cannot even switch
 * tabs to reach the diagnostics. The app has to notice by itself and start
 * somewhere else.
 *
 * The check reads the restored previous session rather than a flag, because
 * React Native has no localStorage - a flag kept there would silently never
 * persist, which is exactly the failure this test is here to prevent. The cases
 * below are the ones that decide whether a real user is sent to a working
 * screen or stranded on a dead one.
 */

const safeWrites: { path: string; contents: string }[] = [];
let mockPrevious = '';

jest.mock('expo-file-system', () => ({
  get documentDirectory() {
    return 'file:///mock/';
  },
  get cacheDirectory() {
    return 'file:///mock/cache/';
  },
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: jest.fn(async (path: string, contents: string) => {
    safeWrites.push({ path, contents });
  }),
  readAsStringAsync: jest.fn(async () => mockPrevious),
  getInfoAsync: jest.fn(async () => ({ exists: mockPrevious.length > 0 })),
  makeDirectoryAsync: jest.fn(async () => undefined),
}));

async function bootWith(previousSession: string) {
  mockPrevious = previousSession;
  jest.resetModules();
  const logging = require('../src/ui/logging');
  await logging.initLogging();
  return logging;
}

describe('previous session that stopped inside Home', () => {
  beforeEach(() => {
    safeWrites.length = 0;
    mockPrevious = '';
  });

  test('a first launch has no previous session, so Home is the default', async () => {
    const logging = await bootWith('');
    expect(logging.lastSessionDiedInsideHome()).toBe(false);
  });

  test('a session that ended after a completed load is not blamed on Home', async () => {
    const logging = await bootWith(
      [
        '2026-09-29T10:00:00.000Z  home          load start',
        '2026-09-29T10:00:01.000Z  home          load done level=1 xp=120',
        '2026-09-29T10:05:00.000Z  app           log opened at v0.4.8',
      ].join('\n'),
    );
    expect(logging.lastSessionDiedInsideHome()).toBe(false);
  });

  // The reported case: Home started loading and the process never got past it.
  test('a session whose last word was a Home checkpoint is treated as a Home crash', async () => {
    const logging = await bootWith(
      [
        '2026-09-29T10:00:00.000Z  home          load start',
        '2026-09-29T10:00:01.000Z  home          queries done',
        '2026-09-29T10:00:01.500Z  home          axis stats built (5 rows)',
      ].join('\n'),
    );
    expect(logging.lastSessionDiedInsideHome()).toBe(true);
  });

  test('a session that died on another tab is left alone', async () => {
    const logging = await bootWith(
      [
        '2026-09-29T10:00:00.000Z  home          load done level=1 xp=120',
        '2026-09-29T10:06:00.000Z  quests        list rendered',
      ].join('\n'),
    );
    expect(logging.lastSessionDiedInsideHome()).toBe(false);
  });

  test('lines logged by this session cannot blame the next one', async () => {
    const logging = await bootWith(
      [
        '2026-09-29T10:00:00.000Z  home          load start',
        '2026-09-29T10:00:01.000Z  home          queries done',
      ].join('\n'),
    );
    // The new session logs right away; the verdict must still describe the old one.
    logging.logEvent('home', 'load start');
    logging.logEvent('home', 'state committed');
    expect(logging.lastSessionDiedInsideHome()).toBe(true);
  });

  test('the verdict is included in the diagnostics dump', async () => {
    const logging = await bootWith(
      ['2026-09-29T10:00:00.000Z  home          load start'].join('\n'),
    );
    expect(logging.readDiagnostics()).toContain('stopped inside Home');
  });
});
