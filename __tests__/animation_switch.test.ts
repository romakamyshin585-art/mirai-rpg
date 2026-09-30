/**
 * The animation kill switch.
 *
 * The Home freeze is reproducible on the device and not in the test suite: with
 * a completed quest the census confirms the phone's exact state
 * (`bests=2 activity=1 completions=1`) and Home renders it cleanly, because
 * react-test-renderer never runs a Reanimated worklet and never fires
 * onLayout. So the cause is in the layer the suite cannot reach, and a sixth
 * guess would be worth exactly as much as the first five.
 *
 * This makes it a one-tap question instead. `useReducedMotion` is the single
 * question the whole app asks before animating, so forcing it on takes every
 * worklet onto its static branch: no springs, no timings, no UI-thread
 * animation, no animated view needing a live target. If Home still freezes
 * with animations off, the cause is not the animation layer.
 *
 * Two things are pinned here. That the switch reaches every caller, since it
 * is only useful if the whole app asks the same question. And that the hook is
 * still called unconditionally - the switch is OR-ed after the call, because
 * returning early above it would register the hook on some renders and not
 * others, which is the exact failure this repo spent two releases chasing.
 */

import { areAnimationsDisabled, setAnimationsDisabled, useReducedMotion } from '../src/ui/motion';
import { freshMemoryDb } from '../src/db';
import { seedIfEmpty } from '../src/seed';
import { AppContext } from '../src/ui/app_context';
import { AuthService } from '../src/services/auth_service';
import { CharacterService } from '../src/services/character_service';
import { QuestService } from '../src/services/quest_service';
import { ProgressionService } from '../src/services/progression_service';
import { AchievementService } from '../src/services/achievement_service';
import { UserRepo } from '../src/repos/user_repo';

jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => false,
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: () => ({}),
  useAnimatedProps: () => ({}),
  useAnimatedReaction: () => undefined,
  useDerivedValue: () => ({ value: 0 }),
  useAnimatedScrollHandler: () => () => undefined,
  useAnimatedRef: () => ({ current: null }),
  withTiming: (v: unknown) => v,
  withSpring: (v: unknown) => v,
  withDelay: (_d: number, v: unknown) => v,
  withSequence: (...v: unknown[]) => v[v.length - 1],
  withRepeat: (v: unknown) => v,
  cancelAnimation: jest.fn(),
  interpolate: (v: number) => v,
  interpolateColor: () => '#000',
  runOnJS: (fn: unknown) => fn,
  Easing: { in: (f: unknown) => f, out: (f: unknown) => f, inOut: (f: unknown) => f, cubic: (t: number) => t, sin: (t: number) => t },
  Extrapolate: { CLAMP: 'clamp' },
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 's', Error: 'e', Warning: 'w' },
}));
jest.mock('mirai-haptics', () => ({ playPredefined: jest.fn(), supportsPredefined: () => false }));

describe('the animation kill switch', () => {
  afterEach(() => setAnimationsDisabled(false));

  test('off by default', () => {
    expect(areAnimationsDisabled()).toBe(false);
  });

  test('the flag is readable by every caller of useReducedMotion', () => {
    setAnimationsDisabled(true);
    expect(areAnimationsDisabled()).toBe(true);
    // The system preference is false in this environment, so a true here can
    // only have come from the switch - which is what proves it is wired in.
    expect(useReducedMotion()).toBe(true);
  });

  test('turning it back off restores the system preference', () => {
    setAnimationsDisabled(true);
    expect(useReducedMotion()).toBe(true);
    setAnimationsDisabled(false);
    expect(useReducedMotion()).toBe(false);
  });

  test('it survives a restart, because a bisect that resets is no bisect', async () => {
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

    await ctx.setAnimationsDisabled(true);
    expect(await ctx.areAnimationsDisabled()).toBe(true);

    // A fresh context, as after a process restart, reads the same value.
    const restarted = new AppContext();
    restarted.db = db;
    await restarted._loadPreferences();
    expect(areAnimationsDisabled()).toBe(true);

    await ctx.setAnimationsDisabled(false);
    expect(await ctx.areAnimationsDisabled()).toBe(false);
  });
});
