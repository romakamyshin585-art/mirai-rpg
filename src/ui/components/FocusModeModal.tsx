import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { QuestRow } from '../../repos/quest_repo';
import type { Category } from '../../domain/category';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { HAPTIC_EVENTS, useHaptics } from '../motion';
import { MotionPressable } from './MotionPressable';
import { Overlay } from './Overlay';

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

type FocusModeModalProps = {
  visible: boolean;
  quest: QuestRow | null;
  onClose: () => void;
  onComplete: (quest: QuestRow) => Promise<void>;
};

export function FocusModeModal({ visible, quest, onClose, onComplete }: FocusModeModalProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const { trigger } = useHaptics();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(false);
    void trigger(HAPTIC_EVENTS.modalOpen);
  }, [visible]);

  if (!quest) return null;

  const categoryColor = colors[`cat${quest.category.charAt(0).toUpperCase()}${quest.category.slice(1)}` as keyof typeof colors];
  const requestClose = () => {
    if (!busy) onClose();
  };

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onComplete(quest);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay visible={visible} onClose={requestClose} align="center">
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.xl,
          },
        ]}
      >
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            disabled={busy}
            onPress={requestClose}
            style={[styles.close, { backgroundColor: colors.surfaceElevated, borderRadius: 20, opacity: busy ? 0.6 : 1 }]}
          >
            <LucideIcon name="x" size={20} color={colors.textSecondary} />
          </MotionPressable>
        </View>
        <ScrollView
          bounces={false}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.icon, { backgroundColor: `${categoryColor}22`, borderColor: `${categoryColor}55` }]}>
            <LucideIcon name={CATEGORY_ICONS[quest.category]} size={28} color={categoryColor} />
          </View>
          <Text style={[styles.category, typography.caption, { color: categoryColor, fontWeight: '800' }]}>
            {CATEGORY_LABELS[quest.category].toUpperCase()}
          </Text>
          <Text style={[styles.title, typography.title, { color: colors.text }]}>{quest.title}</Text>
          {quest.description ? (
            <Text style={[styles.description, typography.body, { color: colors.textSecondary }]}>{quest.description}</Text>
          ) : null}
          <View style={[styles.metrics, { borderColor: colors.borderSubtle }]}>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, typography.numeric, { color: colors.accent }]}>+{quest.xp_reward}</Text>
              <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>XP</Text>
            </View>
            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
            <View style={styles.metric}>
              <Text style={[styles.metricValue, typography.numeric, { color: colors.text }]}>{quest.difficulty}/3</Text>
              <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>сложность</Text>
            </View>
          </View>
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          <MotionPressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void complete()}
            style={[styles.primary, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: busy ? 0.7 : 1 }]}
          >
            {busy ? <ActivityIndicator color={colors.textInverse} /> : <LucideIcon name="check" size={19} color={colors.textInverse} />}
            <Text style={[styles.primaryLabel, { color: colors.textInverse }]}>{busy ? 'Сохраняем…' : 'Отметить выполненным'}</Text>
          </MotionPressable>
          <MotionPressable
            accessibilityRole="button"
            disabled={busy}
            onPress={requestClose}
            style={[styles.secondary, { opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={[styles.secondaryLabel, typography.bodyStrong, { color: colors.textSecondary }]}>Закрыть</Text>
          </MotionPressable>
        </ScrollView>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '88%', flexShrink: 1, alignSelf: 'center', borderWidth: 1, overflow: 'hidden' },
  handleRow: { paddingTop: 10, paddingHorizontal: 14, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2 },
  close: { position: 'absolute', right: 14, top: 14, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  category: { letterSpacing: 0.8, marginBottom: 7 },
  title: { textAlign: 'center' },
  description: { textAlign: 'center', marginTop: 8 },
  metrics: { width: '100%', flexDirection: 'row', alignItems: 'center', marginTop: 22, paddingVertical: 14, borderWidth: 1, borderRadius: 16 },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 18, lineHeight: 24 },
  metricLabel: { marginTop: 2 },
  metricDivider: { width: 1, height: 34 },
  error: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14 },
  primary: { width: '100%', minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 20 },
  primaryLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: 20 },
  secondaryLabel: { fontSize: 14, lineHeight: 20 },
});
