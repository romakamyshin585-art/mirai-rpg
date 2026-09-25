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

export function Overlay({ visible, onClose, children, align = 'center' }: OverlayProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const dragY = useSharedValue(0);
  const closing = useRef(false);
  const { acquire, release } = useContext(OverlayContext);

  // A bottom sheet is laid out inside an auto-height wrapper, so a
  // percentage height on the sheet resolves to `auto` in Yoga and the
  // sheet grows past the bottom of the screen. Giving the wrapper a
  // definite pixel bound keeps every percentage/child constraint inside
  // it resolvable, and gives scrollable children something to shrink
  // against.
  const bottomMaxHeight = Math.max(240, windowHeight - insets.top - 24);

  useEffect(() => {
    if (!visible && !mounted) return;
    acquire();
    return release;
  }, [acquire, mounted, release, visible]);

  const finishClose = useCallback(() => {
    closing.current = false;
    setMounted(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    progress.value = withTiming(0, {
      duration: reduced ? duration.reducedMotion : duration.standard,
      easing: Easing.out(Easing.cubic),
    }, finished => {
      if (finished) runOnJS(finishClose)();
    });
    dragY.value = withTiming(0, { duration: duration.standard });
  }, [dragY, finishClose, progress, reduced]);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      setMounted(true);
      progress.value = reduced
        ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
        : withSpring(1, spring.sheet);
      dragY.value = 0;
      return;
    }
    if (!mounted || closing.current) return;
    progress.value = withTiming(0, {
      duration: reduced ? duration.reducedMotion : duration.standard,
      easing: Easing.out(Easing.cubic),
    }, finished => {
      if (finished) setMounted(false);
    });
  }, [dragY, mounted, progress, reduced, visible]);

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
