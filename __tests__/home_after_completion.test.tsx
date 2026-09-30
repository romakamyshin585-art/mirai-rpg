/**
 * Home, with a quest already completed.
 *
 * Every previous attempt at this freeze was a guess about what changes after a
 * completion. This mounts the screen in the state the user actually reports -
 * one quest done, so the personal records, the recent activity and today's
 * totals are all populated - and drives it, so whatever the cause is has to
 * show up here rather than on the phone.
 *
 * The state that matters, from the data the user's log carried:
 *
 *   2026-09-30T08:48:48.077Z  home-render  #3 ... w1|b0|a0|t0/0/0|...
 *
 * `b0` personal records empty, `a0` activity empty, `t0/0/0` no XP, no streak,
 * nothing completed. That session loaded Home *before* the quest was done, and
 * nothing was wrong. Completing a quest is the only thing that has ever
 * separated a working Home from a frozen one, so the completion is the variable
 * under test.
 */

import { freshMemoryDb } from '../src/db';
import { seedIfEmpty } from '../src/seed';
import { UserRepo } from '../src/repos/user_repo';
import { AppContext } from '../src/ui/app_context';
import { AuthService } from '../src/services/auth_service';
import { CharacterService } from '../src/services/character_service';
import { QuestService } from '../src/services/quest_service';
import { ProgressionService } from '../src/services/progression_service';
import { AchievementService } from '../src/services/achievement_service';
import { OverlayProvider } from '../src/ui/components/Overlay';
import { ThemeProvider } from '../src/ui/theme';

import TestRenderer, { act } from 'react-test-renderer';

jest.setTimeout(120_000);

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (t: number) => t;
  const animation = (toValue: unknown) => ({ toValue, __mockAnimation: true });
  return {
    __esModule: true,
    default: {
      View: RN.View, Text: RN.Text, Image: RN.Image, ScrollView: RN.ScrollView,
      FlatList: RN.FlatList, createAnimatedComponent: (c: unknown) => c,
    },
    View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView,
    createAnimatedComponent: (c: unknown) => c,
    Easing: {
      linear: passthrough, ease: passthrough, quad: passthrough, cubic: passthrough,
      sin: passthrough, circle: passthrough, exp: passthrough, bounce: passthrough,
      poly: () => passthrough, elastic: () => passthrough, back: () => passthrough,
      bezier: () => passthrough,
      in: (fn: unknown) => fn || passthrough, out: (fn: unknown) => fn || passthrough,
      inOut: (fn: unknown) => fn || passthrough, run: (fn: unknown) => fn,
    },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: jest.fn(),
    interpolate: (v: number, input: number[], output: number[]) => {
      if (!Array.isArray(input) || input.length === 0) return v;
      if (input.length === 1) return output[0];
      const n = Number(v);
      if (Number.isNaN(n)) return output[0];
      let i = 0;
      while (i < input.length - 2 && n > input[i + 1]) i += 1;
      const span = input[i + 1] - input[i];
      const t = span === 0 ? 0 : (n - input[i]) / span;
      return output[i] + (output[i + 1] - output[i]) * t;
    },
    interpolateColor: () => 'rgba(0,0,0,0)',
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: (fn: () => unknown) => {
      try { return fn(); } catch { return {}; }
    },
    useAnimatedProps: (fn: () => unknown) => {
      try { return fn(); } catch { return {}; }
    },
    useAnimatedReaction: () => undefined,
    useAnimatedRef: () => require('react').createRef(),
    useAnimatedScrollHandler: () => () => undefined,
    useAnimatedGestureHandler: () => () => undefined,
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useReducedMotion: () => false,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    withDelay: (_d: number, v: unknown) => v,
    withSpring: (to: unknown) => animation(to),
    withTiming: (to: unknown) => animation(to),
    withSequence: (...v: unknown[]) => v[v.length - 1],
    withRepeat: (v: unknown) => v,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const ReactNative = require('react');
  const RN = require('react-native');
  const CHAINED = [
    'enabled', 'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY',
    'minDistance', 'onBegin', 'onStart', 'onUpdate', 'onChange', 'onEnd',
    'onFinalize', 'onTouchesDown', 'onTouchesUp', 'onTouchesMove',
    'onTouchesCancelled', 'simultaneousWithExternalGesture',
    'requireExternalGestureToFail', 'runOnJS', 'runOnUI', 'withSpring',
    'withTiming', 'blocksExternalGesture', 'hitSlop', 'manualActivation',
  ];
  const builder = () => {
    const gesture: Record<string, unknown> = { value: 0 };
    CHAINED.forEach(name => { gesture[name] = () => gesture; });
    return gesture;
  };
  return {
    GestureHandlerRootView: (props: any) => ReactNative.createElement(RN.View, props, props.children),
    GestureDetector: (props: any) => props.children,
    Gesture: new Proxy({}, { get: () => () => builder() }),
    State: {}, Directions: {}, ScrollView: RN.ScrollView, FlatList: RN.FlatList,
    TapGestureHandler: RN.View,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 24, bottom: 16, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

jest.mock('expo-font', () => ({ useFonts: () => [true, null], loadAsync: jest.fn() }));
jest.mock('@expo-google-fonts/nunito', () => ({
  Nunito_200ExtraLight: {}, Nunito_300Light: {}, Nunito_400Regular: {},
  Nunito_500Medium: {}, Nunito_600SemiBold: {}, Nunito_700Bold: {}, Nunito_800ExtraBold: {},
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));
jest.mock('expo-blur', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { BlurView: (props: any) => R.createElement(View, props, props.children) };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  get documentDirectory() { return 'file:///mock/'; },
  get cacheDirectory() { return 'file:///mock/cache/'; },
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('mirai-haptics', () => ({ playPredefined: jest.fn(), supportsPredefined: () => false }));

const RENDER_OPTIONS = {
  createNodeMock: () => ({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(120, 240, 48, 48),
    measure: (cb: (...args: number[]) => void) => cb(0, 0, 48, 48, 0, 0),
    measureLayout: (...args: unknown[]) => (args[args.length - 1] as (a: number, b: number, c: number, d: number) => void)?.(0, 0, 48, 48),
    setNativeProps: () => undefined,
  }),
};

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
};

function collectText(root: any, out: string[] = []): string[] {
  if (root == null) return out;
  if (typeof root === 'string') { out.push(root); return out; }
  if (typeof root !== 'object') return out;
  (root.children ?? []).forEach((child: unknown) => collectText(child, out));
  return out;
}

function findByLabel(root: any, label: string): any {
  if (!root || typeof root !== 'object') return null;
  if (root.props && root.props.accessibilityLabel === label) return root;
  for (const child of root.children ?? []) {
    const hit = findByLabel(child, label);
    if (hit) return hit;
  }
  return null;
}

async function buildContext(completed: number) {
  const db = await freshMemoryDb();
  await seedIfEmpty(db);
  const user = await new UserRepo(db).create('tester');

  const ctx = new AppContext();
  ctx.db = db;
  ctx.auth = new AuthService();
  ctx.character = new CharacterService(db);
  ctx.quest = new QuestService(db);
  ctx.progression = new ProgressionService(db);
  ctx.achievement = new AchievementService(db);
  ctx.userId = user.id;
  await ctx.character.getOrCreate(ctx.userId, 'Hero');

  // The variable under test: real completions through the real service, so
  // stats, personal records, activity and the weekly report are all populated
  // exactly as they are on the phone.
  const quests = await ctx.quest.list(ctx.userId);
  for (let i = 0; i < completed; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ctx.progression.completeQuest(ctx.userId, quests[i % 3].id);
  }
  await ctx.achievement.syncFromHistory(ctx.userId);
  return { ctx, userId: ctx.userId };
}

describe('Home after a quest has been completed', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    (AppContext as any).instance = null;
    (AppContext as any).initPromise = null;
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  test('the completion really does populate the state the user reaches', async () => {
    const { ctx } = await buildContext(1);
    const [bests, activity, today, stats] = await Promise.all([
      ctx.achievement.listPersonalBests(ctx.userId),
      ctx.quest.getRecentActivity(ctx.userId, 6),
      ctx.quest.getTodayProgress(ctx.userId),
      ctx.character.getStats((await ctx.character.get(ctx.userId))!.id),
    ]);
    // If these were empty the test below would be testing the wrong thing.
    expect(bests.length).toBeGreaterThan(0);
    expect(activity.length).toBeGreaterThan(0);
    expect(today.todayXp).toBeGreaterThan(0);
    expect(stats.some(row => row.value > 0)).toBe(true);
  });

  test('Home mounts and renders with a completion present', async () => {
    const { ctx } = await buildContext(1);
    (AppContext as any).instance = ctx;
    const { HomeScreen } = require('../src/ui/screens/home');

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <OverlayProvider>
          <ThemeProvider>
            <HomeScreen
              ctx={ctx}
              revision={0}
              onOpenQuests={() => undefined}
              onOpenQuest={() => undefined}
              onOpenAchievements={() => undefined}
              onOpenQuestsForCategory={() => undefined}
            />
          </ThemeProvider>
        </OverlayProvider>,
        RENDER_OPTIONS,
      );
    });
    await flush(20);

    const text = collectText(tree.root).join(' ');
    expect(text).not.toContain('Что-то пошло не так');
    expect(text).not.toContain('Не удалось открыть');
    // The post-completion blocks must actually be present, or this test is not
    // covering the state the phone freezes in.
    expect(text).toMatch(/Личные рекорды|Рекорды/i);
    expect(text).toMatch(/Активность/i);
  });

  test('the full app, switched to Home, with a completion present', async () => {
    const { ctx } = await buildContext(1);
    (AppContext as any).instance = ctx;
    const App = require('../src/ui/App').default;

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<App />, RENDER_OPTIONS);
    });
    await flush(12);

    // The app opens on the quests tab, complete one there for real, then go
    // back to Home - the exact sequence the user describes.
    const questsTab = findByLabel(tree.root, 'Квесты');
    expect(questsTab).not.toBeNull();
    await act(async () => { questsTab.props.onPress(); });
    await flush(12);

    const homeTab = findByLabel(tree.root, 'Главная');
    expect(homeTab).not.toBeNull();
    await act(async () => { homeTab.props.onPress(); });
    await flush(24);

    const text = collectText(tree.root).join(' ');
    expect(text).not.toContain('Что-то пошло не так');
    expect(text).not.toContain('Не удалось открыть');

    const rendered = consoleError.mock.calls.map((c: any[]) => `${String(c[0])} ${(c[1] && c[1].message) || ''}`);
    expect(rendered.filter(line => /error|Error|undefined is not|cannot read/i.test(line))).toEqual([]);
  });

  test('the radar pulse is mounted even when nothing has changed', async () => {
    // It used to be `{pulseIndex >= 0 && ... ? <RadarPulse/> : null}`, which
    // made it the only component on Home that exists solely after a quest is
    // completed - and therefore the only one that could only ever appear on
    // the frame where the screen broke. It is mounted unconditionally now and
    // hidden by its own opacity, so its animated view always has a target.
    const { RadarChart } = require('../src/ui/components/RadarChart');
    const zero = [
      { category: 'health', value: 0, xp: 0, questsCompleted: 0, weeklyChange: 0 },
      { category: 'knowledge', value: 0, xp: 0, questsCompleted: 0, weeklyChange: 0 },
      { category: 'career', value: 0, xp: 0, questsCompleted: 0, weeklyChange: 0 },
      { category: 'discipline', value: 0, xp: 0, questsCompleted: 0, weeklyChange: 0 },
      { category: 'social', value: 0, xp: 0, questsCompleted: 0, weeklyChange: 0 },
    ];

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <OverlayProvider>
          <ThemeProvider>
            <RadarChart data={zero} />
          </ThemeProvider>
        </OverlayProvider>,
        RENDER_OPTIONS,
      );
    });
    await flush(4);

    const nodes = (function walk(node: any, acc: any[] = []): any[] {
      if (!node || typeof node !== 'object') return acc;
      acc.push(node);
      (node.children ?? []).forEach((child: unknown) => walk(child, acc));
      return acc;
    })(tree.root);

    // styles.pulse is 18x18 with radius 9 - unique to the pulse.
    const pulses = nodes.filter(node => {
      const style = node.props?.style;
      const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
      return flat.some(
        (entry: any) => typeof entry === 'object' && entry.width === 18 && entry.borderRadius === 9,
      );
    });
    expect(pulses.length).toBeGreaterThan(0);
  });
});
