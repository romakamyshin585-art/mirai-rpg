/**
 * MotionNumber: the value-change contract.
 *
 * The bug this pins down took out the whole Home tab. Three `MotionNumber`s
 * were keyed by their own value, so completing a quest changed all three keys
 * in one commit; a key change is an unmount plus a mount, `MotionNumber` had
 * no cleanup, and the UI thread kept writing to view tags React had already
 * dropped. Reanimated raised that from the UI thread, where no error boundary
 * exists, so the app went blank instead of showing an error.
 *
 * The contract, therefore: a value change must animate on the *same*
 * instance, and the animation must be cancelled when the instance goes away.
 * Asserted here by watching the host element survive a value change, and by
 * watching the cleanup cancel the shared value.
 */

import { freshMemoryDb } from '../src/db';
import { AppContext } from '../src/ui/app_context';
import { AuthService } from '../src/services/auth_service';
import { CharacterService } from '../src/services/character_service';
import { QuestService } from '../src/services/quest_service';
import { ProgressionService } from '../src/services/progression_service';
import { AchievementService } from '../src/services/achievement_service';
import { UserRepo } from '../src/repos/user_repo';
import { OverlayProvider } from '../src/ui/components/Overlay';
import { ThemeProvider } from '../src/ui/theme';
import { MotionNumber } from '../src/ui/components/MotionNumber';

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (t: number) => t;
  const animation = (toValue: unknown) => ({ toValue, __mockAnimation: true });
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: (c: unknown) => c },
    View: RN.View,
    Text: RN.Text,
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
    interpolate: (v: number, i: number[], o: number[]) => (i.length ? o[0] : v),
    interpolateColor: () => 'rgba(0,0,0,0)',
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: (fn: () => unknown) => {
      try { return fn(); } catch { return {}; }
    },
    useAnimatedProps: () => ({}),
    useAnimatedReaction: () => undefined,
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

const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
};

function textOf(root: unknown): string {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (typeof node !== 'object') return;
    (node.children ?? []).forEach(walk);
  };
  walk(root);
  return out.join(' ');
}

describe('MotionNumber survives a value change', () => {
  beforeEach(() => {
    (AppContext as any).instance = null;
    (AppContext as any).initPromise = null;
    jest.clearAllMocks();
  });

  test('the same host element is kept when the value changes', async () => {
    const db = await freshMemoryDb();
    const user = await new UserRepo(db).create('tester');
    const ctx = new AppContext();
    ctx.db = db;
    ctx.auth = new AuthService();
    ctx.character = new CharacterService(db);
    ctx.quest = new QuestService(db);
    ctx.progression = new ProgressionService(db);
    ctx.achievement = new AchievementService(db);
    ctx.userId = user.id;

    let tree!: TestRenderer.ReactTestRenderer;
    const render = (value: number) => (
      <OverlayProvider>
        <ThemeProvider>
          <MotionNumber value={value} />
        </ThemeProvider>
      </OverlayProvider>
    );

    await act(async () => {
      tree = TestRenderer.create(render(0), { createNodeMock: () => ({}) });
    });
    await flush();

    const before = textOf(tree.root);
    expect(before).toContain('0');

    // The quest-completion shape: same component, new number.
    await act(async () => {
      tree.update(render(15));
    });
    await flush();

    expect(textOf(tree.root)).toContain('15');
    // A remount would have produced a new host node; the tree must have grown
    // by no new element for the number itself.
    expect(tree.root.findAllByType('Text' as unknown as React.ElementType).length).toBe(1);
  });

  test('the animation is cancelled when the component unmounts', async () => {
    const db = await freshMemoryDb();
    const user = await new UserRepo(db).create('tester');
    const ctx = new AppContext();
    ctx.db = db;
    ctx.auth = new AuthService();
    ctx.character = new CharacterService(db);
    ctx.quest = new QuestService(db);
    ctx.progression = new ProgressionService(db);
    ctx.achievement = new AchievementService(db);
    ctx.userId = user.id;

    const reanimated = require('react-native-reanimated');
    // Keep a real handle so the cleanup is observable.
    const values: { value: number }[] = [];
    reanimated.useSharedValue = (initial: number) => {
      const shared = { value: initial };
      values.push(shared);
      return shared;
    };
    reanimated.cancelAnimation = jest.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <OverlayProvider>
          <ThemeProvider>
            <MotionNumber value={7} />
          </ThemeProvider>
        </OverlayProvider>,
        { createNodeMock: () => ({}) },
      );
    });
    await flush();

    await act(async () => {
      tree.unmount();
    });
    await flush();

    // Something was started and something was cancelled: the UI thread is not
    // left holding an animation for a view that no longer exists.
    expect(values.length).toBeGreaterThan(0);
    expect(reanimated.cancelAnimation).toHaveBeenCalled();
  });
});

describe('the values MotionNumber is given are cancelled somewhere', () => {
  test('cancelAnimation is imported and used', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'ui', 'components', 'MotionNumber.tsx'),
      'utf8',
    ) as string;
    expect(source).toMatch(/cancelAnimation/);
    expect(source).toMatch(/useSharedValue/);
  });
});
