import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolate, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, spring, useReducedMotion } from '../motion';

type OverlayContextValue = {
  active: boolean;
  acquire: () => void;
  release: () => void;
};

const OverlayContext = createContext<OverlayContextValue>({
  active: false,
  acquire: () => undefined,
  release: () => undefined,
});

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const acquire = useCallback(() => setCount(value => value + 1), []);
  const release = useCallback(() => setCount(value => Math.max(0, value - 1)), []);
  const value = useMemo(() => ({ active: count > 0, acquire, release }), [acquire, count, release]);
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlayActivity() {
  return useContext(OverlayContext).active;
}

type OverlayProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'center' | 'bottom';
};

/**
 * Shared modal/sheet surface.
 *
 * Every modal in the app (quest creation, focus mode, achievement
 * details, calendar day) goes through this component, so the two
 * "closing leaves a blank screen" bugs had a single place to live.
 * Guarantees:
 *
 *  - `acquire`/`release` are paired exactly once per visible lifetime,
 *    keyed on `mounted` (the real visible window) with no early-return
 *    hole, so the overlay count can never drift.
 *  - `onClose` fires at most once per open cycle, and never after the
 *    component has unmounted (an animation callback that lands on an
 *    unmounted tree is the classic source of state updates on dead
 *    components).
 *  - Open/close share one `progress` value, so closing mid-open reverses
 *    from the current value instead of snapping.
 *  - Bottom sheets get a definite pixel bound, which is what makes
 *    scrollable children inside them actually scroll (see
 *    `bottomMaxHeight`).
 */
export function Overlay({ visible, onClose, children, align = 'center' }: OverlayProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const dragY = useSharedValue(0);
  const aliveRef = useRef(true);
  const closingRef = useRef(false);
  const notifiedRef = useRef(false);
  const { acquire, release } = useContext(OverlayContext);

  // A bottom sheet is laid out inside an auto-height wrapper, so a
  // percentage height on the sheet resolves to `auto` in Yoga and the
  // sheet grows past the bottom of the screen. Giving the wrapper a
  // definite pixel bound keeps every child constraint inside it
  // resolvable, and gives scrollable children something to shrink
  // against.
  const bottomMaxHeight = Math.max(240, windowHeight - insets.top - 24);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Paired 1:1 with the overlay's visible window.
  useEffect(() => {
    if (!mounted) return;
    acquire();
    return release;
  }, [acquire, mounted, release]);

  const exitDuration = reduced ? duration.reducedMotion : duration.standard;

  const settle = useCallback(
    (notify: boolean) => {
      if (!aliveRef.current) return;
      closingRef.current = false;
      setMounted(false);
      if (notify && !notifiedRef.current) {
        notifiedRef.current = true;
        onClose();
      }
    },
    [onClose],
  );

  /** Run the exit animation; `notify` decides whether the owner is told. */
  const dismiss = useCallback(
    (notify: boolean) => {
      if (closingRef.current) return;
      closingRef.current = true;
      progress.value = withTiming(
        0,
        { duration: exitDuration, easing: Easing.out(Easing.cubic) },
        finished => {
          if (!finished) return;
          runOnJS(settle)(notify);
        },
      );
      dragY.value = withTiming(0, { duration: exitDuration });
    },
    [dragY, exitDuration, progress, settle],
  );

  /** Close requested by the user (backdrop, drag, button, back button). */
  const requestClose = useCallback(() => dismiss(true), [dismiss]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      notifiedRef.current = false;
      setMounted(true);
      progress.value = reduced
        ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
        : withSpring(1, spring.sheet);
      dragY.value = 0;
      return;
    }
    // Owner closed us from the outside: play the exit but do not call
    // onClose back — it would re-enter the state update that started it.
    if (!mounted) return;
    dismiss(false);
  }, [dismiss, dragY, mounted, progress, reduced, visible]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [requestClose, visible]);

  const panGesture = Gesture.Pan()
    .enabled(align === 'bottom' && !reduced)
    .onUpdate(event => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd(event => {
      if (event.translationY > 110 || event.velocityY > 800) {
        runOnJS(requestClose)();
      } else {
        dragY.value = withSpring(0, spring.sheet);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (align === 'bottom' ? interpolate(dragY.value, [0, 320], [1, 0.25], Extrapolate.CLAMP) : 1),
  }));

  const contentStyle = useAnimatedStyle(() => {
    if (align === 'bottom') {
      return {
        opacity: progress.value,
        transform: reduced
          ? []
          : [{ translateY: interpolate(progress.value, [0, 1], [360, 0], Extrapolate.CLAMP) + dragY.value }],
      };
    }
    return {
      opacity: progress.value,
      transform: reduced ? [] : [{ scale: interpolate(progress.value, [0, 1], [0.94, 1], Extrapolate.CLAMP) }],
    };
  });

  if (!mounted) return null;

  return (
    <Animated.View
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        align === 'center'
          ? [styles.center, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]
          : styles.bottom,
      ]}
    >
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={requestClose} style={styles.backdrop} />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            align === 'center' ? styles.centerContent : styles.bottomContent,
            align === 'bottom' ? { maxHeight: bottomMaxHeight } : null,
            contentStyle,
          ]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, elevation: 100 },
  center: { justifyContent: 'center', paddingHorizontal: 18 },
  bottom: { justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  centerContent: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomContent: { width: '100%', alignSelf: 'stretch' },
});

export default Overlay;
