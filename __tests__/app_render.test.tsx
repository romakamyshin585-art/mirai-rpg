/**
 * Render smoke test.
 *
 * Why this file exists: a hook called after a conditional `return` is valid
 * TypeScript, passes `tsc`, passes every other test in this repo, and only
 * shows up on a device as
 *
 *   "Rendered more hooks than during the previous render"
 *
 * twice now. The lint rule catches the source pattern, but before this file
 * nothing in the repo ever actually *mounted* a component, so the failure
 * mode had no test at all. These tests render the real app tree against the
 * memory DB and drive the tab switches and every sheet, which is the
 * sequence that used to trip it.
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

import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (t: number) => t;
  const easingFn = () => passthrough;
  const animation = (toValue: unknown) => ({ toValue, __mockAnimation: true });
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    createAnimatedComponent: (component: unknown) => component,
  };
  return {
    __esModule: true,
    default: Animated,
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    createAnimatedComponent: (component: unknown) => component,
    Easing: {
      linear: passthrough,
      ease: passthrough,
      quad: passthrough,
      cubic: passthrough,
      sin: passthrough,
      circle: passthrough,
      exp: passthrough,
      bounce: passthrough,
      poly: easingFn,
      elastic: easingFn,
      back: easingFn,
      bezier: easingFn,
      in: (fn: unknown) => fn || passthrough,
      out: (fn: unknown) => fn || passthrough,
      inOut: (fn: unknown) => fn || passthrough,
      run: (fn: unknown) => fn,
    },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => undefined,
    interpolate: (value: number, input: number[], output: number[]) => {
      if (!Array.isArray(input) || input.length === 0) return value;
      if (input.length === 1) return output[0];
      const n = Number(value);
      if (Number.isNaN(n)) return output[0];
      let i = 0;
      while (i < input.length - 2 && n > input[i + 1]) i += 1;
      const span = input[i + 1] - input[i];
      const t = span === 0 ? 0 : (n - input[i]) / span;
      return output[i] + (output[i + 1] - output[i]) * t;
    },
    interpolateColor: () => 'rgba(0, 0, 0, 0)',
    runOnJS: (fn: unknown) => fn,
    runOnUI: (fn: unknown) => fn,
    useAnimatedStyle: (fn: () => unknown) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    useAnimatedProps: (fn: () => unknown) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    useAnimatedReaction: () => undefined,
    useAnimatedRef: () => require('react').createRef(),
    useAnimatedScrollHandler: () => () => undefined,
    useAnimatedGestureHandler: () => () => undefined,
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useReducedMotion: () => false,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    withDelay: (_delay: number, value: unknown) => value,
    withSpring: (toValue: unknown) => animation(toValue),
    withTiming: (toValue: unknown) => animation(toValue),
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (value: unknown) => value,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const ReactNative = require('react');
  const RN = require('react-native');
  // Chainable no-op gesture: the real builders return a builder for every
  // configuration call and the app chains them
  // (`Gesture.Pan().enabled(..).onUpdate(..)`). Anything less and the render
  // dies on a missing method.
  const CHAINED = [
    'enabled', 'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY',
    'minDistance', 'minPointers', 'maxPointers', 'onBegin', 'onStart', 'onUpdate',
    'onChange', 'onEnd', 'onFinalize', 'onTouchesDown', 'onTouchesUp',
    'onTouchesMove', 'onTouchesCancelled', 'simultaneousWithExternalGesture',
    'requireExternalGestureToFail', 'runOnJS', 'runOnUI', 'blocksExternalGesture',
    'withSpring', 'withTiming', 'withDecay', 'manualActivation', 'hitSlop',
    'shouldCancelWhenOutside', 'averageTouches', 'context', 'cancelsTouchesInView',
  ];
  const builder = () => {
    const gesture: Record<string, unknown> = { value: 0 };
    CHAINED.forEach(name => {
      gesture[name] = () => gesture;
    });
    return gesture;
  };
  const Gesture = new Proxy({}, { get: () => () => builder() });
  return {
    GestureHandlerRootView: (props: any) => ReactNative.createElement(RN.View, props, props.children),
    GestureDetector: (props: any) => props.children,
    Gesture,
    State: {},
    Directions: {},
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
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
  Nunito_200ExtraLight: { fontFamily: 'Nunito-ExtraLight' },
  Nunito_300Light: { fontFamily: 'Nunito-Light' },
  Nunito_400Regular: { fontFamily: 'Nunito-Regular' },
  Nunito_500Medium: { fontFamily: 'Nunito-Medium' },
  Nunito_600SemiBold: { fontFamily: 'Nunito-SemiBold' },
  Nunito_700Bold: { fontFamily: 'Nunito-Bold' },
  Nunito_800ExtraBold: { fontFamily: 'Nunito-ExtraBold' },
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));
jest.mock('expo-blur', () => {
  const ReactNative = require('react');
  const { View } = require('react-native');
  return { BlurView: (props: any) => ReactNative.createElement(View, props, props.children) };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  documentDirectory: null,
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('mirai-haptics', () => ({ playPredefined: jest.fn(), supportsPredefined: () => false }));

/**
 * Native views are stubs under react-test-renderer, so anything that measures
 * itself would hang forever. The quest FAB measures its own position to grow
 * the create sheet out of the button, and that callback is the only thing
 * that ever sets the sheet open - without this the modal silently never
 * appears and the test would pass without covering it.
 */
const RENDER_OPTIONS = {
  createNodeMock: () => ({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(120, 240, 48, 48),
    measure: (cb: (...args: number[]) => void) => cb(0, 0, 48, 48, 0, 0),
    measureLayout: (...args: unknown[]) => (args[args.length - 1] as (a: number, b: number, c: number, d: number) => void)?.(0, 0, 48, 48),
    setNativeProps: () => undefined,
  }),
};

/**
 * Every tree built here schedules real timers (entrance guards, toast
 * timeouts, the overlay exit). They are unmounted in afterEach so jest does
 * not have to force-kill the worker.
 */
const mountedTrees: TestRenderer.ReactTestRenderer[] = [];

async function createTree(element: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element, RENDER_OPTIONS);
  });
  mountedTrees.push(tree);
  await flush();
  return tree;
}

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
};

async function buildContext() {
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
  return ctx;
}

function collectText(root: any, out: string[] = []): string[] {
  if (root == null) return out;
  if (typeof root === 'string') {
    out.push(root);
    return out;
  }
  if (typeof root !== 'object') return out;
  (root.children ?? []).forEach((child: unknown) => collectText(child, out));
  return out;
}

/** First pressable whose accessibilityLabel matches (substring or regex). */
function findPressable(root: any, matcher: string | RegExp): any {
  if (!root || typeof root !== 'object') return null;
  const props = root.props;
  if (props && typeof props.onPress === 'function' && props.accessibilityLabel != null) {
    const label = String(props.accessibilityLabel);
    if (typeof matcher === 'string' ? label.includes(matcher) : matcher.test(label)) return root;
  }
  for (const child of root.children ?? []) {
    const found = findPressable(child, matcher);
    if (found) return found;
  }
  return null;
}

/** Innermost pressable whose rendered text contains `text`. */
function findPressableByText(root: any, text: string): any {
  if (!root || typeof root !== 'object') return null;
  for (const child of root.children ?? []) {
    const hit = findPressableByText(child, text);
    if (hit) return hit;
  }
  if (typeof root.props?.onPress === 'function') {
    if (collectText(root).join(' ').trim().includes(text)) return root;
  }
  return null;
}

/** Neither error boundary may be showing. */
function expectHealthy(tree: TestRenderer.ReactTestRenderer) {
  const text = collectText(tree.root).join(' ');
  expect(text).not.toContain('Что-то пошло не так');
  expect(text).not.toContain('Не удалось открыть');
}

function hookErrorLines(...spies: jest.SpyInstance[]): string[] {
  return spies
    .flatMap(spy => spy.mock.calls as any[][])
    .map(call => `${String(call[0] ?? '')} ${(call[1] && call[1].message) || ''}`)
    .filter(line => /Rendered (more|fewer) hooks/.test(line));
}

describe('app renders without a render-phase error', () => {
  let consoleError: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;

  beforeEach(() => {
    (AppContext as any).instance = null;
    (AppContext as any).initPromise = null;
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  afterEach(() => {
    // Unmount everything this test built: the entrance guards, toast timeouts
    // and overlay exits are real timers, and jest force-kills the worker
    // rather than hang if they are still pending.
    while (mountedTrees.length) {
      const tree = mountedTrees.pop();
      act(() => {
        tree?.unmount();
      });
    }
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  async function mount() {
    const ctx = await buildContext();
    (AppContext as any).instance = ctx;
    const App = require('../src/ui/App').default;
    return createTree(<App />);
  }

  test('mounts the app and switches every tab', async () => {
    const tree = await mount();
    expect(findPressable(tree.root, 'Достижения')).not.toBeNull();

    for (const label of ['Квесты', 'Календарь', 'Достижения', 'Главная']) {
      const tab = findPressable(tree.root, label);
      expect(tab).not.toBeNull();
      await act(async () => {
        tab.props.onPress();
      });
      await flush();
      expectHealthy(tree);
    }

    expect(hookErrorLines(consoleError, consoleWarn)).toEqual([]);
  });

  test('opens every sheet and modal without tripping a boundary', async () => {
    const ctx = await buildContext();
    // A custom quest is what makes the edit and archive affordances exist:
    // system quests are read-only by design.
    await ctx.quest.create(ctx.userId, {
      title: 'Мой квест',
      category: 'health',
      difficulty: 2,
      xp_reward: 25,
    });
    (AppContext as any).instance = ctx;
    const App = require('../src/ui/App').default;
    const tree = await createTree(<App />);

    const pressNode = async (target: any) => {
      expect(target).not.toBeNull();
      await act(async () => {
        target.props.onPress();
      });
      await flush(8);
      expectHealthy(tree);
    };
    const press = (matcher: string | RegExp) => pressNode(findPressable(tree.root, matcher));
    const pressText = (text: string) => pressNode(findPressableByText(tree.root, text));

    // Home: radar axis pod -> category insight sheet
    await press(/выполнено$/);
    await press('Закрыть');

    // Quests: complete + archived
    await press('Квесты');
    await pressText('Готово');
    await press('Скрытые квесты');
    await press('Закрыть');

    // Calendar: day details
    await press('Календарь');
    await press(/Праздник|Рабочий|Выходной/);
    await press('Закрыть');

    // Achievements: card details + backup sheet
    await press('Достижения');
    await press(/Первый шаг/);
    await press('Закрыть');
    await press('Резервная копия профиля');
    await press('Закрыть');

    expect(hookErrorLines(consoleError, consoleWarn)).toEqual([]);
  });

  /**
   * Panels that are awkward to reach through the UI are mounted directly, and
   * each one is mounted in the closed state first. A hook that only
   * unregisters while a panel is closed is invisible to every other test in
   * this repo, and the closed -> open flip is exactly the transition that
   * produces "Rendered more hooks than during the previous render".
   */
  test('mounts every panel closed, then open, without a hook error', async () => {
    const ctx = await buildContext();
    const custom = await ctx.quest.create(ctx.userId, {
      title: 'Мой квест',
      category: 'health',
      difficulty: 2,
      xp_reward: 25,
    });
    const quests = await ctx.quest.list(ctx.userId);
    const quest = quests.find(row => row.id === custom.id) ?? quests[0];

    const { EditQuestSheet } = require('../src/ui/components/EditQuestSheet');
    const { FocusModeModal } = require('../src/ui/components/FocusModeModal');
    const { ConfirmDialog } = require('../src/ui/components/ConfirmDialog');
    const { CompletionBurst } = require('../src/ui/components/CompletionBurst');
    const { CreateQuestModal } = require('../src/ui/create_quest_modal');

    const panels: [string, (visible: boolean) => React.ReactElement][] = [
      [
        'CreateQuestModal',
        visible => (
          <CreateQuestModal visible={visible} onClose={() => undefined} onSubmit={async () => undefined} />
        ),
      ],
      [
        'EditQuestSheet',
        visible => (
          <EditQuestSheet
            ctx={ctx}
            questId={visible ? custom.id : null}
            visible={visible}
            onClose={() => undefined}
            onSaved={() => undefined}
          />
        ),
      ],
      [
        'FocusModeModal',
        visible => (
          <FocusModeModal
            visible={visible}
            quest={visible ? quest : null}
            onClose={() => undefined}
            onComplete={async () => undefined}
          />
        ),
      ],
      [
        'ConfirmDialog',
        visible => (
          <ConfirmDialog
            visible={visible}
            title='Скрыть квест?'
            subject='«Мой квест»'
            confirmLabel='Скрыть'
            cancelLabel='Отмена'
            destructive
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        ),
      ],
    ];

    for (const render of panels.map(([, component]) => component)) {
      // closed -> open on one instance, which is the transition that matters
      const tree = await createTree(
        <OverlayProvider>
          <ThemeProvider>{render(false)}</ThemeProvider>
        </OverlayProvider>,
      );
      await act(async () => {
        tree.update(
          <OverlayProvider>
            <ThemeProvider>{render(true)}</ThemeProvider>
          </OverlayProvider>,
        );
      });
      await flush(8);
      expectHealthy(tree);
      expect(hookErrorLines(consoleError, consoleWarn)).toEqual([]);
    }

    // The completion burst is not a panel: it is mounted and unmounted on a
    // timer in the middle of the quest list.
    const burst = await createTree(
      <OverlayProvider>
        <ThemeProvider>
          <CompletionBurst xp={25} accent="#F5A524" />
        </ThemeProvider>
      </OverlayProvider>,
    );
    await flush(8);
    expect(burst.root).toBeTruthy();
    expect(hookErrorLines(consoleError, consoleWarn)).toEqual([]);
  });

  /**
   * The fallback is the only evidence a device-only crash produces, so it has
   * to say which build failed and where - a message alone reads the same on an
   * APK from three versions ago. This throws on purpose inside a child.
   */
  test('the error screen names the failing component and the build', async () => {
    const { AppErrorBoundary } = require('../src/ui/components/AppErrorBoundary');
    const { APP_VERSION } = require('../src/app_version');

    function Detonates(): React.ReactElement {
      useState('first render');
      throw new Error('rendered on purpose');
    }

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <OverlayProvider>
          <ThemeProvider>
            <AppErrorBoundary>
              <Detonates />
            </AppErrorBoundary>
          </ThemeProvider>
        </OverlayProvider>,
        RENDER_OPTIONS,
      );
    });
    mountedTrees.push(tree);
    await flush();

    const text = collectText(tree.root).join(' ');
    expect(text).toContain('Что-то пошло не так');
    expect(text).toContain('rendered on purpose');
    expect(text).toContain('Detonates');
    expect(text).toContain(APP_VERSION);
  });
});
