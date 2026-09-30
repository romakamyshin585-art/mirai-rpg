/**
 * CollapsibleBlock: the measured view must not be the animated view.
 *
 * This is the defect that took the Home tab down, and it is worth stating
 * precisely because nothing about it looks like a bug.
 *
 * `onLayout` was attached to the same `Animated.View` whose `height` was being
 * animated from that measurement:
 *
 *   <Animated.View onLayout={e => setHeight(e.layout.height)} style={bodyStyle}>
 *
 *   bodyStyle = { height: height === 0 ? undefined : height * progress.value }
 *
 * `onLayout` reports the height the view currently occupies. That number went
 * into state, the animated style multiplied it by `progress`, the occupied
 * height changed, and `onLayout` fired again - once per frame of the
 * animation, every one a layout pass and a state update that produced another
 * one.
 *
 * No exception is thrown anywhere in that, so no error boundary sees it. The
 * layout channel simply never drains, no frame is painted, and the app goes
 * unresponsive and blank.
 *
 * Why it looked intermittent: these blocks are the personal records and the
 * recent activity, both empty until a quest is completed. Before the first
 * completion the body never mounted, so there was no loop. Completing a quest
 * mounted it, and clearing app data emptied the lists again.
 *
 * The test asserts the invariant structurally - the view carrying `onLayout`
 * and the view carrying the animated height are different elements - and then
 * drives the measurement cycle to prove it settles instead of running away.
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

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.setTimeout(60_000);

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


function flatten(root: any, out: any[] = []): any[] {
  if (!root || typeof root !== 'object') return out;
  out.push(root);
  (root.children ?? []).forEach((child: unknown) => flatten(child, out));
  return out;
}

function isAnimatedHeightStyle(style: any): boolean {
  const flat = Array.isArray(style) ? style.flat(3) : [style];
  return flat.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    return entry.overflow === 'hidden' && ('height' in entry || 'transform' in entry || 'opacity' in entry);
  });
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('CollapsibleBlock measurement', () => {
  let CollapsibleBlock: any;

  beforeAll(async () => {
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
    (AppContext as any).instance = ctx;
    // The block is not exported; it is reached through the screen's own module.
    const home = require('../src/ui/screens/home');
    CollapsibleBlock = home.__CollapsibleBlockForTests;
  });

  test('the measured view is not the animated view', async () => {
    expect(CollapsibleBlock).toBeDefined();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <OverlayProvider>
          <ThemeProvider>
            <CollapsibleBlock
              title="Личные рекорды"
              hint="hint"
              icon="trophy"
              expanded
              onToggle={() => undefined}
            >
              <React.Fragment>
                <React.Fragment key="row">one record row</React.Fragment>
                <React.Fragment key="row2">another record row</React.Fragment>
              </React.Fragment>
            </CollapsibleBlock>
          </ThemeProvider>
        </OverlayProvider>,
        { createNodeMock: () => ({}) },
      );
    });
    await flush();

    const nodes = flatten(tree.root);
    const measured = nodes.filter(node => typeof node.props?.onLayout === 'function');
    const animated = nodes.filter(node => isAnimatedHeightStyle(node.props?.style));

    // The invariant, stated as a test: these must not be the same element.
    expect(measured.length).toBeGreaterThan(0);
    expect(animated.length).toBeGreaterThan(0);
    const measuredIsAnimated = measured.some(node => isAnimatedHeightStyle(node.props?.style));
    expect(measuredIsAnimated).toBe(false);
  });

  test('reporting the same height repeatedly does not re-render', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <OverlayProvider>
          <ThemeProvider>
            <CollapsibleBlock
              title="Активность"
              hint="hint"
              icon="list-checks"
              expanded
              onToggle={() => undefined}
            >
              <React.Fragment>content</React.Fragment>
            </CollapsibleBlock>
          </ThemeProvider>
        </OverlayProvider>,
        { createNodeMock: () => ({}) },
      );
    });
    await flush();

    const measured = flatten(tree.root).filter(node => typeof node.props?.onLayout === 'function');
    expect(measured.length).toBeGreaterThan(0);

    const report = (height: number) =>
      act(async () => {
        measured.forEach(node => node.props.onLayout({ nativeEvent: { layout: { height } } }));
      });

    await report(120);
    const afterFirst = tree.toJSON();
    // A layout event with an unchanged height must not produce a new tree, and
    // definitely must not cascade: on the old code each report shrank the
    // height and provoked another one.
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await report(120);
    }
    expect(tree.toJSON()).toEqual(afterFirst);
  });
});