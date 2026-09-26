/**
 * Per-axis detail sheet.
 *
 * Opened by tapping a pod on the Home radar chart. Answers the question
 * the chart itself cannot: not "how big is this axis" but "what did I
 * actually do in it" — quests completed, XP earned, share of the whole
 * profile, and how it moved over the last week.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { MotionProgressBar } from './MotionProgressBar';
import { Overlay } from './Overlay';
import { duration, spring, useReducedMotion } from '../motion';

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

export type AxisInsight = {
  xp: number;
  questsCompleted: number;
  /** XP earned in the last 7 days, for the delta chip. */
  weeklyXp: number;
};

export type CategoryInsightSheetProps = {
  category: Category | null;
  insights: Record<Category, AxisInsight>;
  onClose: () => void;
  /** "Все квесты" — jump to the quest list filtered by this axis. */
  onOpenQuests?: (category: Category) => void;
};

export function CategoryInsightSheet({ category, insights, onClose, onOpenQuests }: CategoryInsightSheetProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const entrance = useSharedValue(0);

  useEffect(() => {
    if (!category) {
      entrance.value = withTiming(0, { duration: duration.micro });
      return;
    }
    entrance.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withSpring(1, spring.sheet);
  }, [category, entrance, reduced]);

  const totals = useMemo(() => {
    const all = CATEGORIES.map(axis => insights[axis]?.xp ?? 0);
    const xp = all.reduce((sum, value) => sum + value, 0);
    const quests = CATEGORIES.reduce((sum, axis) => sum + (insights[axis]?.questsCompleted ?? 0), 0);
    return { xp, quests, max: Math.max(1, ...all) };
  }, [insights]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: reduced ? [] : [{ translateY: (1 - entrance.value) * 40 }, { scale: 0.97 + entrance.value * 0.03 }],
  }));

  if (!category) {
    return <Overlay visible={false} onClose={onClose}>{null}</Overlay>;
  }

  const item = insights[category] ?? { xp: 0, questsCompleted: 0, weeklyXp: 0 };
  const color = colors[`cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors];
  const share = totals.xp > 0 ? item.xp / totals.xp : 0;
  const fairShare = 1 / CATEGORIES.length;
  const delta = fairShare > 0 ? share / fairShare : 0;

  return (
    <Overlay visible onClose={onClose} align="bottom" panTarget="handle">
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            paddingBottom: 22,
          },
          sheetStyle,
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: `${color}20`, borderColor: color }]}>
            <LucideIcon name={CATEGORY_ICONS[category]} size={24} color={color} strokeWidth={2.2} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[typography.title, { color: colors.text }]}>{CATEGORY_LABELS[category]}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Область развития</Text>
          </View>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            style={[styles.close, { backgroundColor: colors.surfaceElevated }]}
          >
            <LucideIcon name="x" size={19} color={colors.textSecondary} />
          </MotionPressable>
        </View>

        <View style={styles.stats}>
          <Stat label="Заработано" value={`${item.xp}`} suffix="XP" color={color} index={0} reduced={reduced} />
          <Stat label="Выполнено" value={`${item.questsCompleted}`} suffix="квестов" color={colors.text} index={1} reduced={reduced} />
          <Stat
            label="За 7 дней"
            value={`${item.weeklyXp >= 0 ? '+' : ''}${item.weeklyXp}`}
            suffix="XP"
            color={item.weeklyXp > 0 ? colors.success : colors.textMuted}
            index={2}
            reduced={reduced}
          />
        </View>

        <View style={styles.shareBlock}>
          <View style={styles.shareHeader}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Доля в профиле</Text>
            <Text style={[typography.numericSmall, { color }]}>{Math.round(share * 100)}%</Text>
          </View>
          <MotionProgressBar
            value={share}
            trackColor={colors.surfaceFloating}
            fillColor={color}
            height={8}
            style={styles.shareTrack}
            accessibilityLabel={`Доля области: ${Math.round(share * 100)} процентов`}
          />
          <View style={styles.shareFooter}>
            <View style={styles.fairRow}>
              <View style={[styles.fairMark, { backgroundColor: colors.textMuted }]} />
              <Text style={[typography.caption, { color: colors.textMuted }]}>Средняя по профилю {Math.round(fairShare * 100)}%</Text>
            </View>
            <View style={styles.deltaChip}>
              <LucideIcon
                name={delta >= 1 ? 'trending-up' : 'trending-down'}
                size={13}
                color={delta >= 1 ? colors.success : colors.warning}
              />
              <Text
                style={[
                  typography.caption,
                  { color: delta >= 1 ? colors.success : colors.warning, fontWeight: '800' },
                ]}
              >
                {delta >= 1 ? 'свыше среднего' : 'ниже среднего'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.hint, { backgroundColor: colors.accentSoft, borderColor: `${colors.accent}44` }]}>
          <LucideIcon name="lightbulb" size={16} color={colors.accent} />
          <Text style={[typography.caption, { color: colors.accent, flex: 1 }]}>
            {delta >= 1
              ? 'Эта область держится выше остальных — можно сместить фокус'
              : 'Рекомендации наверху подберут квесты именно сюда'}
          </Text>
        </View>

        {onOpenQuests ? (
          <MotionPressable
            accessibilityRole="button"
            onPress={() => onOpenQuests(category)}
            style={[styles.action, { backgroundColor: colors.accent, borderRadius: radius.md }]}
          >
            <LucideIcon name="list-checks" size={18} color={colors.textInverse} strokeWidth={2.4} />
            <Text style={[styles.actionLabel, { color: colors.textInverse }]}>Квесты по этой области</Text>
          </MotionPressable>
        ) : null}
      </Animated.View>
    </Overlay>
  );
}

function Stat({
  label,
  value,
  suffix,
  color,
  index,
  reduced,
}: {
  label: string;
  value: string;
  suffix: string;
  color: string;
  index: number;
  reduced: boolean;
}) {
  const { colors, typographyStylesheet: typography } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withDelay(60 + index * 70, withSpring(1, spring.card));
  }, [index, progress, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ translateY: interpolate(progress.value, [0, 1], [10, 0], 'clamp') }],
  }));

  return (
    <Animated.View style={[styles.stat, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }, style]}>
      <Text style={[typography.numeric, { color }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>{suffix}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { width: '100%', borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  statLabel: { fontFamily: 'Nunito', fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  shareBlock: { marginTop: 16 },
  shareHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  shareTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  shareFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, gap: 8 },
  fairRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  fairMark: { width: 2, height: 12, borderRadius: 1 },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16 },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  actionLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
});

export default CategoryInsightSheet;
