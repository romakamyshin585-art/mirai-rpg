/**
 * NextQuestRow — Compact next quest preview with CTA.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { SPACING } from '../theme';
import { CATEGORY_COLORS } from '../theme';
import { CATEGORY_LABELS } from '../theme';
import { LucideIcon } from '../components';

interface NextQuestRowProps {
  quest: {
    id: string;
    title: string;
    category: string;
    difficulty: 1 | 2 | 3;
    xp_reward: number;
    time?: string;
  } | null;
  onPress: () => void;
}

const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Лёгкий',
  2: 'Средний',
  3: 'Сложный',
};

export function NextQuestRow({ quest, onPress }: NextQuestRowProps) {
  const { colors, motion } = useTheme();
  const { numeric, caption, body, bodyStrong } = useTheme().typographyStylesheet;
  
  const entranceProgress = useSharedValue(0);
  const pressProgress = useSharedValue(0);

  React.useEffect(() => {
    if (quest) {
      entranceProgress.value = withSpring(1, { damping: 22, stiffness: 180 });
    }
  }, [quest]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [16, 0], Extrapolate.CLAMP) }],
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressProgress.value, [0, 1], [1, 0.98], Extrapolate.CLAMP) }],
  }));

  if (!quest) {
    return (
      <Animated.View style={[styles.container, containerStyle]}>
        <View style={styles.emptyState}>
          <Text style={{ ...body, color: colors.textMuted }}>Нет запланированных квестов</Text>
          <Text style={{ ...caption, color: colors.textSecondary, marginTop: SPACING.xs }}>Добавьте квест во вкладке «Квесты»</Text>
        </View>
      </Animated.View>
    );
  }

  const catColor = CATEGORY_COLORS[quest.category as keyof typeof CATEGORY_COLORS] || colors.accent;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => pressProgress.value = withSpring(1, { damping: 20, stiffness: 300 })}
        onPressOut={() => pressProgress.value = withSpring(0, { damping: 20, stiffness: 300 })}
        style={[{ backgroundColor: '#23262E' }, pressStyle]}
        android_ripple={{ color: catColor + '40' }}
      >
        <View style={styles.content}>
          <View style={styles.left}>
            <View style={[styles.categoryBar, { backgroundColor: catColor }]} />
            <View style={styles.info}>
              <View style={styles.headerRow}>
                <Text style={{ ...bodyStrong, color: colors.text }}>{quest.title}</Text>
                <View style={[styles.difficultyBadge, { backgroundColor: catColor + '20' }]}>
                  <Text style={{ ...caption, color: catColor, fontWeight: '600' }}>{DIFFICULTY_LABELS[quest.difficulty]}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Text style={{ ...caption, color: colors.textSecondary }}>
                  {CATEGORY_LABELS[quest.category as keyof typeof CATEGORY_LABELS] || quest.category}
                </Text>
                {quest.time && (
                  <>
                    <Text style={{ ...caption, color: colors.textSecondary }}>·</Text>
                    <Text style={{ ...caption, color: colors.textSecondary }}>{quest.time}</Text>
                  </>
                )}
              </View>
            </View>
          </View>
          
          <View style={styles.right}>
            <View style={styles.xpReward}>
              <Text style={{ ...numeric, color: colors.accent }}>+{quest.xp_reward}</Text>
              <Text style={{ ...caption, color: colors.textMuted }}>XP</Text>
            </View>
            <View style={styles.arrow}>
              <LucideIcon name="chevron-right" size={20} color={colors.textSecondary} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E2128',
  },
  emptyState: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
    minWidth: 0,
  },
  categoryBar: {
    width: 4,
    height: 48,
    borderRadius: 2,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  difficultyBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  xpReward: {
    alignItems: 'flex-end',
  },
  arrow: {
    paddingLeft: SPACING.sm,
  },
});

export default NextQuestRow;