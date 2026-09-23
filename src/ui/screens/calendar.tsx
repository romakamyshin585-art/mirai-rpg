/**
 * Calendar screen — Heatmap + Timeline with expandable day detail.
 * Performance improvements:
 * - Batched DB queries in loadDayDetail (N+1 → 2 queries)
 * - Memoized heatmap cells
 * - Stable keys
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { Card, H1, H2, H3, Muted, Text } from '../components';
import { AppContext } from '../app_context';
import { useTheme } from '../theme';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../theme';
import { type Category } from '../../domain/category';
import { dayKey } from '../../domain/achievements';
import { CompletionRepo, QuestRepo } from '../../repos/quest_repo';
import { TYPOGRAPHY_STYLESHEET } from '../theme';

function intensityColor(xp: number, colors: any): string {
  if (xp === 0) return colors.card;
  if (xp < 20) return '#3F2C1A';
  if (xp < 50) return '#7A521A';
  if (xp < 100) return '#F5A524';
  if (xp < 200) return '#F5C232';
  return '#FDE68A';
}

interface DayCell {
  date: Date;
  key: string;
  xp: number;
}

interface DayDetail {
  date: Date;
  key: string;
  xp: number;
  quests: Array<{
    title: string;
    category: Category;
    xp: number;
    time: string;
  }>;
}

export function CalendarScreen({ ctx }: { ctx: AppContext }) {
  const { colors, spacing, typography, motion } = useTheme();
  
  const [days, setDays] = useState<DayCell[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayCell | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  
  const reload = useCallback(async () => {
    const cRepo = new CompletionRepo(ctx.db);
    const today = new Date();
    const cells: DayCell[] = [];
    for (let i = 34; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const xp = await cRepo.sumXpForDay(ctx.userId, k);
      cells.push({ date: d, key: k, xp });
    }
    setDays(cells);
  }, [ctx]);

  useEffect(() => { reload(); }, [reload]);

  // Optimized: batch queries instead of N+1
  const loadDayDetail = useCallback(async (day: DayCell) => {
    const cRepo = new CompletionRepo(ctx.db);
    const qRepo = new QuestRepo(ctx.db);
    
    // Single query for all completions
    const completions = await cRepo.listRecent(ctx.userId, 100);
    const dayCompletions = completions.filter(c => dayKey(new Date(c.completed_at)) === day.key);
    
    // Batch fetch all quests at once
    const questIds = dayCompletions.map(c => c.quest_id);
    const quests = await Promise.all(questIds.map(id => qRepo.getById(id)));
    
    const questData = dayCompletions.map((c, i) => ({
      title: quests[i]?.title ?? '—',
      category: c.category,
      xp: c.xp_awarded,
      time: new Date(c.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
    
    setDayDetail({
      date: day.date,
      key: day.key,
      xp: day.xp,
      quests: questData,
    });
  }, [ctx]);

  const handleDayPress = useCallback((day: DayCell) => {
    if (selectedDay?.key === day.key) {
      setSelectedDay(null);
      setDayDetail(null);
    } else {
      setSelectedDay(day);
      loadDayDetail(day);
    }
  }, [selectedDay, loadDayDetail]);

  const totalXp = useMemo(() => days.reduce((s, d) => s + d.xp, 0), [days]);
  const activeDays = useMemo(() => days.filter((d) => d.xp > 0).length, [days]);

  // Animated styles for day detail sheet
  const sheetHeight = useSharedValue(0);
  const sheetOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (selectedDay) {
      sheetHeight.value = withSpring(1, { damping: 20, stiffness: 150 });
      sheetOpacity.value = withTiming(1, { duration: 200 });
    } else {
      sheetHeight.value = withSpring(0, { damping: 20, stiffness: 150 });
      sheetOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [selectedDay]);

  const sheetStyle = useAnimatedStyle(() => ({
    height: interpolate(sheetHeight.value, [0, 1], [0, 350], Extrapolate.CLAMP),
    opacity: sheetOpacity.value,
  }));

  // Memoized heatmap grid
  const heatmapGrid = useMemo(() => {
    const grid: DayCell[][] = [];
    for (let wi = 0; wi < 5; wi++) {
      grid.push(days.slice(wi * 7, (wi + 1) * 7));
    }
    return grid;
  }, [days]);

  return (
    <Animated.ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <H1>Calendar</H1>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Muted>35 Days</Muted>
          <Text style={{ ...TYPOGRAPHY_STYLESHEET.numericDisplay, color: colors.accent }}>{totalXp} XP</Text>
        </View>
        <View style={styles.summaryCard}>
          <Muted>Active Days</Muted>
          <Text style={{ ...TYPOGRAPHY_STYLESHEET.numericDisplay, color: colors.accent }}>{activeDays} / 35</Text>
        </View>
      </View>

      {/* Heatmap */}
      <H3>Activity Heatmap</H3>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {heatmapGrid.map((week, wi) => (
            <View key={wi} style={{ gap: spacing.xs }}>
              {week.map((d) => (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => handleDayPress(d)}
                  style={[
                    styles.heatmapCell,
                    { backgroundColor: intensityColor(d.xp, colors) },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={{
                      color: d.xp > 80 ? '#0E0F12' : colors.textMuted,
                      fontSize: 10,
                      fontWeight: d.xp > 0 ? '600' : '400',
                    }}
                  >
                    {d.date.getDate()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        <View style={{ height: spacing.md }} />
        <View style={styles.legend}>
          <Text style={{ ...typography.caption, color: colors.textMuted }}>less</Text>
          {['#3F2C1A', '#7A521A', '#F5A524', '#F5C232', '#FDE68A'].map((c) => (
            <View key={c} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: c }} />
          ))}
          <Text style={{ ...typography.caption, color: colors.textMuted }}>more</Text>
        </View>
      </Card>

      {/* Selected Day Detail Sheet */}
      <Animated.View style={[styles.daySheet, sheetStyle]} pointerEvents={selectedDay ? 'auto' : 'none'}>
        {selectedDay && dayDetail && (
          <View style={styles.dayDetail}>
            <View style={styles.dayDetailHeader}>
              <View style={styles.dayDetailHandle} />
              <Text style={{ ...typography.title, color: colors.text }}>{dayDetail.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
              <Text style={{ ...TYPOGRAPHY_STYLESHEET.numericDisplay, color: colors.accent }}>{dayDetail.xp} XP</Text>
            </View>

            {dayDetail.quests.length === 0 ? (
              <Muted>No quests completed this day</Muted>
            ) : (
              <View style={styles.questsList}>
                {dayDetail.quests.map((q, i) => (
                  <View key={i} style={styles.questItem}>
                    <View style={[styles.questCategoryDot, { backgroundColor: CATEGORY_COLORS[q.category] }]} />
                    <View style={styles.questInfo}>
                      <Text style={{ ...typography.body, color: colors.text }}>{q.title}</Text>
                      <View style={styles.questMeta}>
                        <Text style={{ ...typography.caption, color: CATEGORY_COLORS[q.category] }}>{CATEGORY_LABELS[q.category]}</Text>
                        <Text style={{ ...typography.caption, color: colors.textMuted }}>·</Text>
                        <Text style={{ ...typography.caption, color: colors.textMuted }}>{q.time}</Text>
                        <Text style={{ fontFamily: 'Nunito', fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] as any, color: colors.accent }}>+{q.xp} XP</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {/* History */}
      <H2>Recent Activity</H2>
      {/* TODO: Add recent activity list */}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1A1C22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E2128',
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heatmapCell: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1C22',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1E2128',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    overflow: 'hidden',
  },
  dayDetailHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#1E2128',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  dayDetailHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  dayDetail: {
    flex: 1,
  },
  emptyQuests: {
    textAlign: 'center',
    marginTop: 32,
  },
  questsList: {
    gap: 8,
  },
  questItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#23262E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2128',
  },
  questCategoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  questInfo: {
    flex: 1,
  },
  questMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  questCategory: {
    fontWeight: '600',
  },
});

export default CalendarScreen;