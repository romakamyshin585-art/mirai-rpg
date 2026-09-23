/**
 * DailyProgress — Today's activity summary.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { SPACING } from '../theme';
import { CATEGORY_COLORS } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS } from '../theme';
import { LucideIcon } from '../components';

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart',
  knowledge: 'book-open',
  career: 'briefcase',
  discipline: 'target',
  social: 'users',
};

interface DailyProgressProps {
  todayXp: number;
  completedQuests: number;
  totalQuests: number;
  streak: number;
  categoryXp: Record<Category, number>;
  nextQuest?: { title: string; category: Category; time: string } | null;
}

export function DailyProgress({
  todayXp,
  completedQuests,
  totalQuests,
  streak,
  categoryXp,
  nextQuest,
}: DailyProgressProps) {
  const { colors, motion } = useTheme();
  const { numeric, numericDisplay, caption, section, body, bodyStrong } = useTheme().typographyStylesheet;
  
  const entranceProgress = useSharedValue(0);
  const statEntrance = useSharedValue(0);

  React.useEffect(() => {
    entranceProgress.value = withSpring(1, { damping: 22, stiffness: 180 });
    statEntrance.value = withTiming(1, { duration: motion.durations.fast });
  }, [motion.durations.fast]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [16, 0], Extrapolate.CLAMP) }],
  }));

  const mainStatStyle = useAnimatedStyle(() => ({
    opacity: withTiming(statEntrance.value, { duration: motion.durations.fast }),
    transform: [{ scale: interpolate(statEntrance.value, [0, 1], [0.8, 1], Extrapolate.CLAMP) }],
  }));

  const secondaryStatsStyle = useAnimatedStyle(() => ({
    opacity: withTiming(statEntrance.value, { duration: motion.durations.fast }),
    transform: [{ translateY: interpolate(statEntrance.value, [0, 1], [12, 0], Extrapolate.CLAMP) }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.header}>
        <Text style={{ ...section, color: colors.textSecondary }}>TODAY</Text>
        <View style={styles.streakBadge}>
          <LucideIcon name="flame" size={14} color={colors.warning} />
          <Text style={{ ...numeric, color: colors.accent }}>{streak}</Text>
          <Text style={{ ...caption, color: colors.textMuted }}>дней</Text>
        </View>
      </View>

      <Animated.View style={[styles.mainStat, mainStatStyle]}>
        <Text style={{ ...numericDisplay, color: colors.accent }}>{todayXp}</Text>
        <Text style={{ ...caption, color: colors.textMuted }}>XP сегодня</Text>
      </Animated.View>

      <Animated.View style={[styles.secondaryRow, secondaryStatsStyle]}>
        <View style={styles.statItem}>
          <Text style={{ ...numeric, color: colors.text }}>{completedQuests}</Text>
          <Text style={{ ...caption, color: colors.textMuted }}>из {totalQuests} квестов</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={{ ...numeric, color: colors.accent }}>+{todayXp}</Text>
          <Text style={{ ...caption, color: colors.textMuted }}>XP заработано</Text>
        </View>
      </Animated.View>

      <View style={styles.categoryBreakdown}>
        {CATEGORIES.map((cat) => {
          const xp = categoryXp[cat] || 0;
          if (xp === 0) return null;
          return (
            <View key={cat} style={styles.categoryMini}>
              <View style={[styles.categoryDot, { backgroundColor: CATEGORY_COLORS[cat] }]} />
              <View style={styles.categoryLabel}>
                <LucideIcon name={CATEGORY_ICONS[cat]} size={12} color={CATEGORY_COLORS[cat]} />
                <Text style={{ ...caption, color: colors.textSecondary, flex: 1 }}>{xp} XP</Text>
              </View>
            </View>
          );
        })}
      </View>

      {nextQuest && (
        <View style={styles.nextQuest}>
          <View style={styles.nextQuestHeader}>
            <Text style={{ ...caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Следующий</Text>
            <View style={[styles.categoryPill, { backgroundColor: CATEGORY_COLORS[nextQuest.category] + '20', borderColor: CATEGORY_COLORS[nextQuest.category] }]}>
              <View style={styles.categoryPillContent}>
                <LucideIcon name={CATEGORY_ICONS[nextQuest.category]} size={12} color={CATEGORY_COLORS[nextQuest.category]} />
                <Text style={{ ...caption, color: CATEGORY_COLORS[nextQuest.category], fontWeight: '600' }}>{CATEGORY_LABELS[nextQuest.category]}</Text>
              </View>
            </View>
          </View>
          <Text style={{ ...body, color: colors.text }}>{nextQuest.title}</Text>
          <Text style={{ ...caption, color: colors.textMuted, marginTop: SPACING.xs }}>{nextQuest.time}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1C22',
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#1E2128',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#3D2B0A',
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: '#3D2B0A',
  },
  streakIcon: {
    fontSize: 14,
  },
  mainStat: {
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  statItem: {
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: '#1E2128',
    marginHorizontal: SPACING.md,
  },
  categoryBreakdown: {
    marginBottom: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#1E2128',
  },
  categoryMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  nextQuest: {
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#1E2128',
  },
  nextQuestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
});

export default DailyProgress;