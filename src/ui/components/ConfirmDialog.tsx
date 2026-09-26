/**
 * In-app confirmation dialog.
 *
 * Replaces `Alert.alert` for destructive confirmations. The native Android
 * alert is a system-styled grey slab with a hard border and stock buttons
 * — in a dark, warm-accented app it read as a foreign element, and it
 * cannot carry the app's typography, iconography or motion. This one is
 * built from the same tokens as every other surface: radius scale, card
 * elevation, accent/danger semantic colours, Nunito, and the shared
 * overlay spring.
 *
 * Deliberate behaviour:
 *  - the destructive action is the *secondary* visual weight (a tinted
 *    fill), not a full-bleed red button, and "Оставить" is the default
 *    focus so a stray Enter/tap cannot destroy data;
 *  - Android hardware back and a backdrop tap both cancel, never confirm;
 *  - `busy` state is owned by the caller so the button can show a spinner
 *    while the write is in flight and stay disabled.
 */

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { Overlay } from './Overlay';
import { duration, spring, useReducedMotion } from '../motion';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  /** Optional line under the title. `subject` is emphasised. */
  message?: string;
  subject?: string;
  icon?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  subject,
  icon = 'undo-2',
  confirmLabel,
  cancelLabel,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      progress.value = withTiming(0, { duration: duration.micro });
      return;
    }
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withSpring(1, spring.sheet);
  }, [progress, reduced, visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced
      ? []
      : [
          { scale: 0.94 + progress.value * 0.06 },
          { translateY: (1 - progress.value) * 14 },
        ],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced
      ? []
      : [
          { scale: 0.6 + progress.value * 0.4 },
          { rotate: `${(1 - progress.value) * -18}deg` },
        ],
  }));

  const accent = destructive ? colors.danger : colors.accent;
  const accentSoft = destructive ? colors.dangerSoft : colors.accentSoft;

  return (
    <Overlay visible={visible} onClose={busy ? () => undefined : onCancel}>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius['2xl'],
            maxWidth: 420,
          },
          cardStyle,
        ]}
      >
        <View style={[styles.glow, { backgroundColor: accentSoft, opacity: 0.55 }]} />
        <Animated.View
          style={[
            styles.icon,
            { backgroundColor: accentSoft, borderColor: accent },
            iconStyle,
          ]}
        >
          <LucideIcon name={icon} size={24} color={accent} strokeWidth={2.2} />
        </Animated.View>

        <Text style={[styles.title, typography.title, { color: colors.text }]}>{title}</Text>

        {subject ? (
          <View style={[styles.subject, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md }]}>
            <Text numberOfLines={2} style={[styles.subjectText, typography.bodyStrong, { color: colors.text }]}>
              {subject}
            </Text>
          </View>
        ) : null}

        {message ? (
          <Text style={[styles.message, typography.secondary, { color: colors.textMuted }]}>{message}</Text>
        ) : null}

        <View style={styles.actions}>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            disabled={busy}
            onPress={onCancel}
            style={[
              styles.action,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                borderRadius: radius.md,
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.actionLabel, typography.bodyStrong, { color: colors.textSecondary }]}>{cancelLabel}</Text>
          </MotionPressable>

          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onConfirm}
            style={[
              styles.action,
              styles.actionFlex,
              {
                backgroundColor: accentSoft,
                borderColor: accent,
                borderRadius: radius.md,
                opacity: busy ? 0.7 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <>
                <LucideIcon name="undo-2" size={17} color={accent} strokeWidth={2.4} />
                <Text style={[styles.actionLabel, typography.bodyStrong, { color: accent }]}>{confirmLabel}</Text>
              </>
            )}
          </MotionPressable>
        </View>
      </Animated.View>
    </Overlay>
  );
}

/** Convenience wrapper for the "cancel a completion" case. */
export function UndoCompletionDialog({
  visible,
  title,
  category,
  xp,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  category: string;
  xp: number;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const categoryKey = category as keyof typeof CATEGORY_LABELS;
  const label = CATEGORY_LABELS[categoryKey] ?? category;
  return (
    <ConfirmDialog
      visible={visible}
      title="Отменить выполнение?"
      subject={`«${title}»`}
      message={`Квест исчезнет из истории дня, а ${xp} XP вернутся в общий прогресс. Запись в разделе «${label}» уменьшится.`}
      confirmLabel="Отменить выполнение"
      cancelLabel="Оставить"
      onConfirm={onConfirm}
      onCancel={onCancel}
      busy={busy}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -70,
    alignSelf: 'center',
    width: 190,
    height: 140,
    borderRadius: 95,
  },
  icon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, lineHeight: 27, textAlign: 'center', marginTop: 14 },
  subject: {
    width: '100%',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginTop: 14,
  },
  subjectText: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 11 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 20, width: '100%' },
  action: { minHeight: 48, paddingHorizontal: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionFlex: { flex: 1, flexDirection: 'row', gap: 8 },
  actionLabel: { fontSize: 14, lineHeight: 18, fontWeight: '800' },
});

export default ConfirmDialog;
