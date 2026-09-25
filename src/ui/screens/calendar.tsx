import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import { CompletionRepo, QuestRepo } from '../../repos/quest_repo';
import { dayKey } from '../../domain/time';
import type { Category } from '../../domain/category';
import { BOTTOM_NAV_BASE_HEIGHT, CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { Overlay } from '../components/Overlay';
import { MotionPressable } from '../components/MotionPressable';
import { duration, spring, useReducedMotion, useScrollHeader } from '../motion';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const RUSSIAN_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
  '2026-01-06', '2026-01-07', '2026-01-08', '2026-02-23', '2026-03-08',
  '2026-03-09', '2026-05-01', '2026-05-09', '2026-06-12', '2026-11-04',
]);

type CompletionItem = {
  id: string;
  title: string;
  category: Category;
  xp: number;
  time: string;
};

type ActivityDay = {
  key: string;
  xp: number;
  completions: CompletionItem[];
};

const EMPTY_ACTIVITY: ActivityDay = { key: '', xp: 0, completions: [] };

type MonthDay = {
  date: Date;
  key: string;
  inMonth: boolean;
};

type DayLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CalendarScreenProps = {
  ctx: AppContext;
  revision: number;
  onDataChanged: () => void;
};

export function CalendarScreen({ ctx, revision, onDataChanged }: CalendarScreenProps) {
  const { colors, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { onScroll: onHeaderScroll, style: headerStyle } = useScrollHeader();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activity, setActivity] = useState<Record<string, ActivityDay>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [dayLayouts, setDayLayouts] = useState<Record<string, DayLayout>>({});
  const requestId = useRef(0);
  const reduced = useReducedMotion();
  const monthTransition = useSharedValue(0);
  const monthDirection = useSharedValue(1);
  const selectionX = useSharedValue(0);
  const selectionY = useSharedValue(0);
  const selectionOpacity = useSharedValue(0);

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError(null);
    try {
      const first = new Date(month.getFullYear(), month.getMonth(), 1);
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const rows = await new CompletionRepo(ctx.db).listBetween(ctx.userId, first, nextMonth);
      const quests = rows.length > 0
        ? await new QuestRepo(ctx.db).getByIds([...new Set(rows.map(row => row.quest_id))])
        : [];
      const questsById = new Map(quests.map(quest => [quest.id, quest]));
      const grouped: Record<string, ActivityDay> = {};
      for (const row of rows) {
        const key = dayKey(new Date(row.completed_at));
        const quest = questsById.get(row.quest_id);
        const item: CompletionItem = {
          id: row.id,
          title: quest?.title ?? 'Выполненный квест',
          category: row.category,
          xp: row.xp_awarded,
          time: new Date(row.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        };
        grouped[key] = {
          key,
          xp: (grouped[key]?.xp ?? 0) + row.xp_awarded,
          completions: [...(grouped[key]?.completions ?? []), item],
        };
      }
      for (const day of Object.values(grouped)) day.completions.sort((a, b) => a.time.localeCompare(b.time));
      if (currentRequest === requestId.current) setActivity(grouped);
    } catch (value) {
      if (currentRequest === requestId.current) setError(value instanceof Error ? value.message : String(value));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [ctx, month]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload, revision]);

  useEffect(() => {
    monthTransition.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withTiming(1, { duration: duration.major, easing: Easing.out(Easing.cubic) });
  }, [month, monthTransition, reduced]);

  const monthDays = useMemo(() => buildMonthDays(month), [month]);
  const todayKey = dayKey(new Date());
  const monthRows = useMemo(
    () => Object.values(activity)
      .filter(day => day.completions.length > 0)
      .sort((a, b) => b.key.localeCompare(a.key)),
    [activity],
  );
  const totalXp = Object.values(activity).reduce((sum, day) => sum + day.xp, 0);
  const totalCompletions = Object.values(activity).reduce((sum, day) => sum + day.completions.length, 0);
  const activeDays = Object.values(activity).filter(day => day.xp > 0).length;
  const selectedKey = selectedDate ? dayKey(selectedDate) : null;
  const selectedActivity = selectedKey ? activity[selectedKey] : null;
  const selectedLayout = selectedKey ? dayLayouts[selectedKey] : undefined;

  useEffect(() => {
    if (!selectedLayout) {
      selectionOpacity.value = withTiming(0, { duration: duration.micro });
      return;
    }
    if (reduced) {
      selectionX.value = selectedLayout.x;
      selectionY.value = selectedLayout.y;
      selectionOpacity.value = withTiming(1, { duration: duration.reducedMotion });
      return;
    }
    selectionX.value = withSpring(selectedLayout.x, spring.card);
    selectionY.value = withSpring(selectedLayout.y, spring.card);
    selectionOpacity.value = withTiming(1, { duration: duration.micro, easing: Easing.out(Easing.cubic) });
  }, [reduced, selectedLayout, selectionOpacity, selectionX, selectionY]);

  const monthStyle = useAnimatedStyle(() => ({
    opacity: interpolate(monthTransition.value, [0, 1], [0.2, 1], Extrapolate.CLAMP),
    transform: reduced ? [] : [{ translateX: interpolate(monthTransition.value, [0, 1], [monthDirection.value * 28, 0], Extrapolate.CLAMP) }],
  }));

  const selectionStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
    transform: reduced ? [] : [{ translateX: selectionX.value }, { translateY: selectionY.value }],
  }));

  const handleDayLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setDayLayouts(current => {
      const previous = current[key];
      if (previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height) return current;
      return { ...current, [key]: { x, y, width, height } };
    });
  }, []);

  const moveMonth = (offset: number) => {
    setSelectedDate(null);
    setUndoError(null);
    monthDirection.value = offset >= 0 ? 1 : -1;
    monthTransition.value = 0;
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const openDay = useCallback((date: Date) => {
    setUndoError(null);
    setSelectedDate(date);
  }, []);

  const undoCompletion = useCallback(async (completionId: string) => {
    setUndoingId(completionId);
    setUndoError(null);
    let changed = false;
    try {
      const result = await ctx.progression.undoQuestCompletion(ctx.userId, completionId);
      if (!result.success) {
        setUndoError('Не удалось отменить выполнение. Попробуй ещё раз.');
        return false;
      }
      changed = true;
      try {
        await ctx.achievement.syncFromHistory(ctx.userId);
      } catch {
        setUndoError('Выполнение отменено. Достижения пересчитаются при следующем запуске.');
      }
      return true;
    } catch (value) {
      setUndoError(value instanceof Error ? value.message : String(value));
      return false;
    } finally {
      if (changed) onDataChanged();
      setUndoingId(null);
    }
  }, [ctx, onDataChanged]);

  return (
    <>
      <Animated.ScrollView
        onScroll={onHeaderScroll}
        scrollEventThrottle={16}
        style={[styles.scroll, { backgroundColor: colors.bg }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 14, paddingBottom: BOTTOM_NAV_BASE_HEIGHT + insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
            tintColor={colors.accent}
          />
        }
      >
        <Animated.View style={headerStyle}>
          <View style={styles.heading}>
            <View>
              <Text style={[styles.title, typography.title, { color: colors.text }]}>Календарь</Text>
              <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Итоговый календарь и твоя активность</Text>
            </View>
          </View>
        </Animated.View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Загружаем календарь…</Text>
          </View>
        ) : error ? (
          <View style={styles.loadingState}>
            <LucideIcon name="cloud-off" size={38} color={colors.danger} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Календарь не загрузился</Text>
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
            <MotionPressable
              accessibilityRole="button"
              onPress={() => void reload()}
              style={[styles.retry, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
            </MotionPressable>
          </View>
        ) : (
          <>
            <View style={styles.metricsRow}>
              <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.metricValue, typography.numericDisplay, { color: colors.accent }]}>{totalXp}</Text>
                <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>XP за месяц</Text>
              </View>
              <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.metricValue, typography.numericDisplay, { color: colors.text }]}>{activeDays}</Text>
                <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>активных дней</Text>
              </View>
              <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.metricValue, typography.numericDisplay, { color: colors.text }]}>{totalCompletions}</Text>
                <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>квестов</Text>
              </View>
            </View>

            <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <View style={styles.monthHeader}>
                <MotionPressable
                  accessibilityRole="button"
                  accessibilityLabel="Предыдущий месяц"
                  onPress={() => moveMonth(-1)}
                  style={[styles.monthButton, { backgroundColor: colors.surfaceElevated }]}
                >
                  <LucideIcon name="chevron-left" size={20} color={colors.textSecondary} />
                </MotionPressable>
                <Text style={[styles.monthTitle, typography.bodyStrong, { color: colors.text }]}>{formatMonth(month)}</Text>
                <MotionPressable
                  accessibilityRole="button"
                  accessibilityLabel="Следующий месяц"
                  onPress={() => moveMonth(1)}
                  style={[styles.monthButton, { backgroundColor: colors.surfaceElevated }]}
                >
                  <LucideIcon name="chevron-right" size={20} color={colors.textSecondary} />
                </MotionPressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((day, index) => (
                  <Text key={day} style={[styles.weekday, typography.caption, { color: index >= 5 ? colors.textMuted : colors.textSecondary }]}>{day}</Text>
                ))}
              </View>
              <Animated.View style={[styles.grid, monthStyle]}>
                {monthDays.map((day, index) => {
                  const dayActivity = activity[day.key];
                  const selected = selectedKey === day.key;
                  const today = todayKey === day.key;
                  const holiday = RUSSIAN_HOLIDAYS_2026.has(day.key);
                  const weekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                  return (
                    <MotionPressable
                       key={`${day.key}-${index}`}
                       onLayout={event => handleDayLayout(day.key, event)}
                       disabled={!day.inMonth}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDate(day.date)}: ${getDayStatus(day.date, holiday, weekend)}`}
                      accessibilityState={{ selected, disabled: !day.inMonth }}
                      onPress={() => openDay(day.date)}
                      style={[
                        styles.dayCell,
                        {
                          backgroundColor: !day.inMonth
                            ? 'transparent'
                            : selected
                              ? `${colors.accent}22`
                              : dayActivity?.xp
                                ? `${colors.catHealth}12`
                                : colors.surfaceElevated,
                          borderColor: !day.inMonth
                            ? 'transparent'
                            : selected
                              ? colors.accent
                              : today
                                ? `${colors.accent}AA`
                                : dayActivity?.xp
                                  ? `${colors.catHealth}AA`
                                  : colors.borderSubtle,
                          borderWidth: !day.inMonth
                            ? 0
                            : selected || today || dayActivity?.xp
                              ? 1.5
                              : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          typography.caption,
                          {
                            color: !day.inMonth
                              ? 'transparent'
                              : holiday
                                ? colors.catHealth
                                : selected
                                  ? colors.accent
                                  : dayActivity?.xp
                                    ? colors.text
                                    : colors.textSecondary,
                            fontWeight: today || selected || holiday ? '800' : '600',
                          },
                        ]}
                      >
                        {day.date.getDate()}
                      </Text>
                       {dayActivity?.xp ? <CompletionMark color={colors.catHealth} /> : null}
                      {holiday && day.inMonth ? <View style={[styles.holidayDot, { backgroundColor: colors.catHealth }]} /> : null}
                    </MotionPressable>
                  );
                 })}
                {selectedLayout ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.selectionRing,
                      {
                        borderColor: colors.accent,
                        left: reduced ? selectedLayout?.x ?? 0 : 0,
                        top: reduced ? selectedLayout?.y ?? 0 : 0,
                        width: selectedLayout?.width ?? 0,
                        height: selectedLayout?.height ?? 0,
                      },
                      selectionStyle,
                    ]}
                  />
                ) : null}
              </Animated.View>

              <View style={[styles.legend, { borderTopColor: colors.borderSubtle }]}>
                <LegendItem color={colors.textMuted} label="Рабочий" />
                <LegendItem color={colors.textSecondary} label="Сегодня" ring />
                <LegendItem color={colors.catHealth} label="Праздник" />
                <LegendItem color={colors.accent} label="Выбран" />
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Активность месяца</Text>
                <Text style={[styles.sectionHint, typography.caption, { color: colors.textMuted }]}>Нажми на день, чтобы открыть детали</Text>
              </View>
            </View>
            <View style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              {monthRows.length === 0 ? (
                <View style={styles.emptyRecent}>
                  <LucideIcon name="calendar-x" size={30} color={colors.textMuted} />
                  <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>В этом месяце пока нет активности</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>Заверши квест — день отметится автоматически</Text>
                </View>
              ) : (
                monthRows.slice(0, 7).map(day => {
                  const first = day.completions[0];
                  const [year, month, date] = day.key.split('-').map(Number);
                  return (
                    <MotionPressable
                      key={day.key}
                      accessibilityRole="button"
                      onPress={() => openDay(new Date(year, month - 1, date))}
                      style={[styles.recentRow, {}]}
                    >
                      <View style={[styles.recentDate, { backgroundColor: colors.surfaceElevated }]}>
                        <Text style={[typography.numeric, { color: colors.accent }]}>{day.completions.length}</Text>
                      </View>
                      <View style={styles.recentCopy}>
                        <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>{first.title}</Text>
                        <Text style={[typography.caption, { color: colors.textMuted }]}>{CATEGORY_LABELS[first.category]} · {day.xp} XP</Text>
                      </View>
                      <LucideIcon name="chevron-right" size={18} color={colors.textMuted} />
                    </MotionPressable>
                  );
                })
              )}
            </View>
          </>
        )}
      </Animated.ScrollView>

      <DayModal
        date={selectedDate}
        activity={selectedActivity ?? EMPTY_ACTIVITY}
        undoingId={undoingId}
        undoError={undoError}
        onUndo={undoCompletion}
        onClose={() => setSelectedDate(null)}
      />
    </>
  );
}

function DayModal({
  date,
  activity,
  undoingId,
  undoError,
  onUndo,
  onClose,
}: {
  date: Date | null;
  activity: ActivityDay;
  undoingId: string | null;
  undoError: string | null;
  onUndo: (completionId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [expandedCompletionId, setExpandedCompletionId] = useState<string | null>(null);
  const holiday = date ? RUSSIAN_HOLIDAYS_2026.has(dayKey(date)) : false;
  const weekend = date ? date.getDay() === 0 || date.getDay() === 6 : false;
  // Pixel bound instead of a percentage: the sheet sits inside an
  // auto-height wrapper, where a percentage height resolves to `auto`
  // and the list below never gets a scrollable box.
  const sheetMaxHeight = Math.max(320, Math.round(windowHeight * 0.78));

  useEffect(() => {
    if (!date) setExpandedCompletionId(null);
  }, [date]);

  const close = () => {
    setExpandedCompletionId(null);
    onClose();
  };

  const confirmUndo = (item: CompletionItem) => {
    setExpandedCompletionId(null);
    Alert.alert(
      'Отменить выполнение?',
      `Квест «${item.title}» исчезнет из истории, а ${item.xp} XP будут вычтены из общего прогресса.`,
      [
        { text: 'Оставить', style: 'cancel' },
        {
          text: 'Отменить выполнение',
          style: 'destructive',
          onPress: () => {
            void onUndo(item.id);
          },
        },
      ],
    );
  };

  return (
    <Overlay visible={date !== null} onClose={close} align="bottom">
      {date ? (
        <View
          style={[
            styles.daySheet,
            {
              paddingBottom: insets.bottom + 20,
              maxHeight: sheetMaxHeight,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={[styles.sheetDate, typography.title, { color: colors.text }]}>{formatDate(date)}</Text>
              <View style={styles.sheetStatusRow}>
                <View style={[styles.sheetStatusDot, { backgroundColor: holiday ? colors.catHealth : weekend ? colors.textMuted : colors.success }]} />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{getDayStatus(date, holiday, weekend)}</Text>
              </View>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={close}
              style={[styles.closeButton, { backgroundColor: colors.surfaceElevated }]}
            >
              <LucideIcon name="x" size={20} color={colors.textSecondary} />
            </MotionPressable>
          </View>
          <View style={[styles.dayTotal, { backgroundColor: colors.accentSoft }]}>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>За этот день</Text>
              <Text style={[styles.dayXp, typography.numericDisplay, { color: colors.accent }]}>{activity.xp} XP</Text>
            </View>
            <View style={styles.dayCount}>
              <LucideIcon name="list-checks" size={21} color={colors.accent} />
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{activity.completions.length}</Text>
            </View>
          </View>
          {undoError ? (
            <View style={[styles.undoError, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
              <LucideIcon name="circle-alert" size={17} color={colors.danger} />
              <Text style={[typography.caption, { color: colors.danger, flex: 1 }]}>{undoError}</Text>
            </View>
          ) : null}
          {activity.completions.length === 0 ? (
            <View style={styles.emptyDay}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceElevated }]}>
                <LucideIcon name="moon" size={28} color={colors.textMuted} />
              </View>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>В этот день квестов не было</Text>
              <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>Можно начать новую серию прямо сейчас</Text>
            </View>
          ) : (
            <FlatList
              data={activity.completions}
              keyExtractor={item => item.id}
              bounces={false}
              showsVerticalScrollIndicator
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              style={styles.dayList}
              contentContainerStyle={styles.dayListContent}
              renderItem={({ item }) => {
                const categoryColor = colors[`cat${item.category.charAt(0).toUpperCase()}${item.category.slice(1)}` as keyof typeof colors];
                const expanded = expandedCompletionId === item.id;
                const undoing = undoingId === item.id;
                return (
                  <View
                    style={[
                      styles.questRow,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md },
                    ]}
                  >
                    <MotionPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title}, ${item.xp} XP`}
                      accessibilityHint="Показать отмену выполнения"
                      accessibilityState={{ expanded }}
                      disabled={Boolean(undoingId)}
                      onPress={() => setExpandedCompletionId(current => current === item.id ? null : item.id)}
                      style={[styles.questMain, { opacity: Boolean(undoingId) ? 0.6 : 1 }]}
                    >
                      <View style={[styles.questIcon, { backgroundColor: `${categoryColor}20` }]}>
                        <LucideIcon name="check" size={17} color={categoryColor} />
                      </View>
                      <View style={styles.questCopy}>
                        <Text numberOfLines={2} style={[typography.bodyStrong, { color: colors.text }]}>{item.title}</Text>
                        <Text style={[typography.caption, { color: colors.textMuted }]}>{item.time} · {CATEGORY_LABELS[item.category]}</Text>
                      </View>
                      <Text style={[typography.numericSmall, { color: colors.accent }]}>+{item.xp}</Text>
                    </MotionPressable>
                    {expanded ? (
                      <MotionPressable
                        accessibilityRole="button"
                        accessibilityLabel={`Отменить выполнение: ${item.title}`}
                        disabled={Boolean(undoingId)}
                        onPress={() => confirmUndo(item)}
                        style={[
                          styles.undoButton,
                          {
                            backgroundColor: colors.dangerSoft,
                            borderLeftColor: colors.borderSubtle,
                            opacity: undoing ? 0.6 : 1,
                          },
                        ]}
                      >
                        {undoing ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <LucideIcon name="undo-2" size={20} color={colors.danger} />
                        )}
                      </MotionPressable>
                    ) : null}
                  </View>
                );
              }}
            />
          )}
        </View>
      ) : null}
    </Overlay>
  );
}

function CompletionMark({ color }: { color: string }) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withSpring(1, spring.card);
  }, [progress, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ scale: 0.65 + progress.value * 0.35 }],
  }));

  return (
    <Animated.View style={[styles.completionMark, { borderColor: color }, style]}>
      <View style={[styles.activityDot, { backgroundColor: color }]} />
    </Animated.View>
  );
}

function LegendItem({ color, label, ring = false }: { color: string; label: string; ring?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: ring ? 'transparent' : color, borderColor: color, borderWidth: ring ? 2 : 0 }]} />
      <Text style={{ fontFamily: 'Nunito', fontSize: 10, lineHeight: 14, color: '#8A8E99' }}>{label}</Text>
    </View>
  );
}

function buildMonthDays(month: Date): MonthDay[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthIndex, index - leading + 1);
    return { date, key: dayKey(date), inMonth: date.getMonth() === monthIndex };
  });
}

function formatMonth(month: Date): string {
  const value = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, value => value.toUpperCase());
}

function getDayStatus(_date: Date, holiday: boolean, weekend: boolean): string {
  if (holiday) return 'Нерабочий праздничный день';
  if (weekend) return 'Выходной';
  return 'Рабочий день';
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  loadingState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  loadingText: { fontFamily: 'Nunito', fontSize: 13 },
  errorTitle: { fontFamily: 'Nunito', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { minHeight: 46, borderRadius: 14, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryLabel: { fontFamily: 'Nunito', fontSize: 14, fontWeight: '800' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, lineHeight: 34 },
  subtitle: { marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minHeight: 92, borderWidth: 1, borderRadius: 17, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 24, lineHeight: 30 },
  metricLabel: { textAlign: 'center', marginTop: 2 },
  calendarCard: { borderWidth: 1, borderRadius: 20, padding: 12 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 16, lineHeight: 21 },
  weekRow: { flexDirection: 'row', marginBottom: 5 },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', position: 'relative' },
  selectionRing: { position: 'absolute', top: 0, left: 0, borderWidth: 1.5, borderRadius: 12, zIndex: 3 },
  completionMark: { position: 'absolute', bottom: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayCell: { width: '14.2857%', aspectRatio: 1, borderRadius: 12, marginBottom: 3, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 11, lineHeight: 15 },
  activityDot: { width: 4, height: 4, borderRadius: 2 },
  holidayDot: { position: 'absolute', top: 5, right: 5, width: 3, height: 3, borderRadius: 2 },
  legend: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 9, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, lineHeight: 21 },
  sectionHint: { marginTop: 1 },
  recentCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
  recentRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomColor: '#1E2128', borderBottomWidth: StyleSheet.hairlineWidth },
  recentDate: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recentCopy: { flex: 1, minWidth: 0 },
  emptyRecent: { minHeight: 170, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 7 },
  daySheet: { width: '100%', flexShrink: 1, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 10 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  sheetHeaderCopy: { flex: 1 },
  sheetDate: { fontSize: 22, lineHeight: 28 },
  sheetStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sheetStatusDot: { width: 7, height: 7, borderRadius: 4 },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  dayTotal: { minHeight: 72, borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dayXp: { fontSize: 27, lineHeight: 33, marginTop: 1 },
  dayCount: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  undoError: { minHeight: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  // flexShrink (not flex:1) is what makes this a real scroll box: the
  // sheet has a pixel maxHeight, the list takes its content height and
  // shrinks (then scrolls) when the content is taller.
  dayList: { flexGrow: 0, flexShrink: 1 },
  dayListContent: { paddingTop: 12, paddingBottom: 8, gap: 8 },
  questRow: { minHeight: 68, borderWidth: 1, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  questMain: { flex: 1, minWidth: 0, minHeight: 68, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  undoButton: { width: 50, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1 },
  questIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  questCopy: { flex: 1, minWidth: 0 },
  emptyDay: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 7 },
  emptyIcon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
});

export default CalendarScreen;
