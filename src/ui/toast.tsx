import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
  const [busy, setBusy] = useState(false);

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
      entering={FadeInDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.host, { bottom: bottomOffset }]}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            disabled={busy}
            onPress={() => void runAction()}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.accentSoft, borderRadius: radius.sm, opacity: pressed || busy ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.actionLabel, typography.caption, { color: colors.accent, fontWeight: '800' }]}>
              {busy ? '…' : actionLabel}
            </Text>
          </Pressable>
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
