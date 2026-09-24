import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MotionPressable } from './components/MotionPressable';
import { duration, useReducedMotion } from './motion';
import { useTheme } from './theme';

type ToastProps = {
  message: string | null;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
  onHide: () => void;
  bottomOffset: number;
};

export function Toast({ message, actionLabel, onAction, onHide, bottomOffset }: ToastProps) {
  const { colors, radius, typography } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!message) {
      progress.value = 0;
      return;
    }
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withTiming(1, { duration: duration.micro, easing: Easing.out(Easing.cubic) });
  }, [message, progress, reduced]);

  const hostStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ translateY: (1 - progress.value) * 12 }],
  }));

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(onHide, actionLabel ? 6500 : 2800);
    return () => clearTimeout(timeout);
  }, [actionLabel, message, onHide]);

  if (!message) return null;

  const runAction = async () => {
    if (!onAction || busy) return;
    setBusy(true);
    try {
      await onAction();
    } catch (error) {
      console.warn('[MiraiRPG] Toast action failed:', error);
    } finally {
      setBusy(false);
      onHide();
    }
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.host, hostStyle, { bottom: bottomOffset }]}
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
            disabled={busy}
            onPress={() => void runAction()}
            style={[
              styles.action,
              { backgroundColor: colors.accentSoft, borderRadius: radius.sm, opacity: busy ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.actionLabel, typography.caption, { color: colors.accent, fontWeight: '800' }]}>
              {busy ? '…' : actionLabel}
            </Text>
          </MotionPressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, zIndex: 80 },
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
