/**
 * Toast.
 *
 * **Mounting contract:** mounted only while there is a message, and it
 * always renders its host view. It used to be mounted unconditionally and
 * return null when there was nothing to say, so its `useAnimatedStyle` had
 * no view while the effect still wrote to the shared value - which throws
 * "Cannot find host instance for this component" rather than warning.
 * The same trap was fixed in CategoryInsightSheet and CompletionBurst.
 *
 * It also moves to the top of the screen while a bottom sheet is open, so
 * it does not land on the sheet's own list.
 */

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { MotionPressable } from './components/MotionPressable';
import { duration, useReducedMotion } from './motion';
import { useTheme } from './theme';

type ToastProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
  onHide: () => void;
  bottomOffset?: number;
  /** Used instead of bottomOffset when a bottom sheet owns the lower screen. */
  top?: number;
};

export function Toast({ message, actionLabel, onAction, onHide, bottomOffset, top }: ToastProps) {
  const { colors, radius, typography } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withSequence(
      withTiming(1, { duration: duration.standard, easing: Easing.out(Easing.cubic) }),
      // Hold, then slide away. The owner unmounts us on hide, so the exit
      // is only ever seen when it is interrupted.
      withTiming(1, { duration: 1 }),
    );
  }, [message, progress, reduced]);

  const hostStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ translateY: (1 - progress.value) * 12 }],
  }));

  useEffect(() => {
    const timeout = setTimeout(onHide, actionLabel ? 6500 : 2800);
    return () => clearTimeout(timeout);
  }, [actionLabel, message, onHide]);

  const runAction = async () => {
    if (!onAction) return;
    try {
      await onAction();
    } catch (error) {
      console.warn('[MiraiRPG] Toast action failed:', error);
    } finally {
      onHide();
    }
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.host, hostStyle, top !== undefined ? { top } : { bottom: bottomOffset }]}
    >
      <View
        style={[
          styles.toast,
          {
            backgroundColor: colors.surfaceFloating,
            borderColor: colors.border,
            borderRadius: radius.md,
          },
        ]}
      >
        <View style={[styles.statusIcon, { backgroundColor: colors.successSoft }]}>
          <Text style={[styles.statusMark, { color: colors.success }]}>✓</Text>
        </View>
        <Text numberOfLines={2} style={[styles.message, typography.bodyStrong, { color: colors.text }]}>
          {message}
        </Text>
        {actionLabel && onAction ? (
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => void runAction()}
            style={[
              styles.action,
              { backgroundColor: colors.accentSoft, borderRadius: radius.sm },
            ]}
          >
            <Text style={[styles.actionLabel, typography.caption, { color: colors.accent, fontWeight: '800' }]}>
              {actionLabel}
            </Text>
          </MotionPressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, zIndex: 120 },
  toast: {
    minHeight: 58,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusMark: { fontFamily: 'Nunito', fontSize: 18, fontWeight: '900' },
  message: { flex: 1, fontSize: 14, lineHeight: 19 },
  action: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, lineHeight: 16 },
});

export default Toast;
