import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { AppContext } from '../app_context';
import type { QuestRow } from '../../repos/quest_repo';
import { CATEGORIES, type Category } from '../../domain/category';
import { BOTTOM_NAV_BASE_HEIGHT, CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { CreateQuestModal } from '../create_quest_modal';
import { FocusModeModal } from '../components/FocusModeModal';
import { MotionPressable } from '../components/MotionPressable';
import { HAPTIC_EVENTS, duration, scale, spring, useHaptics, useReducedMotion } from '../motion';
import { MotionProgressBar } from '../components/MotionProgressBar';

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Легко',
  2: 'Средне',
  3: 'Сложно',
};

export type QuestCompletionNotice = {
  message: string;
  achievementNames: string[];
  achievementCodes: string[];
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number;
  undo: () => Promise<void>;
};

type QuestsScreenProps = {
  ctx: AppContext;
  revision: number;
  onDataChanged: () => void;
  onQuestCompleted: (notice: QuestCompletionNotice) => void;
};

export function QuestsScreen({ ctx, revision, onDataChanged, onQuestCompleted }: QuestsScreenProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { trigger } = useHaptics();
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [focusQuest, setFocusQuest] = useState<QuestRow | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const loadedOnce = useRef(false);
  const requestId = useRef(0);
  const latestCompletionByQuest = useRef(new Map<string, string>());
  // The FAB floats over the list, so it used to sit on top of a card's
  // "Готово" button while scrolling. It now gets out of the way: hidden
  // while scrolling down, back as soon as the user scrolls up.
  const fabVisible = useSharedValue(1);
  const lastScrollY = useRef(0);
  const onListScroll = useAnimatedScrollHandler({
    onScroll: event => {
      const y = event.contentOffset.y;
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < 4) return;
      lastScrollY.current = y;
      fabVisible.value = delta > 0 ? 0 : 1;
    },
  });
  const fabStyle = useAnimatedStyle(() => ({
    opacity: fabVisible.value,
    transform: [
      { scale: 0.85 + fabVisible.value * 0.15 },
      { translateY: (1 - fabVisible.value) * 12 },
    ],
  }));

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const rows = await ctx.quest.list(ctx.userId, filter === 'all' ? undefined : { category: filter });
      if (currentRequest === requestId.current) setQuests(rows);
      loadedOnce.current = true;
    } catch (value) {
      if (currentRequest === requestId.current) setError(value instanceof Error ? value.message : String(value));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [ctx, filter]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const summary = useMemo(() => {
    const totalXp = quests.reduce((sum, quest) => sum + quest.xp_reward, 0);
    const custom = quests.filter(quest => quest.is_system === 0).length;
    return { totalXp, custom };
  }, [quests]);

  const operationLocked = busy !== null || undoing;

  const complete = async (quest: QuestRow): Promise<boolean> => {
    if (operationLocked) return false;
    setBusy(quest.id);
    try {
      const result = await ctx.progression.completeQuest(ctx.userId, quest.id);
      let unlocks: Array<{ code: string; name: string; rarity: string }> = [];
      try {
        unlocks = await ctx.achievement.checkAfterCompletion(ctx.userId, {
          completionAt: new Date(),
          category: result.category,
          questId: quest.id,
          difficulty: quest.difficulty,
          xpAwarded: result.xpAwarded,
          completionId: result.completionId,
        });
      } catch (value) {
        console.warn('[MiraiRPG] Achievement check failed:', value);
      }

      latestCompletionByQuest.current.set(quest.id, result.completionId);
      setCompletedIds(current => new Set(current).add(quest.id));
      onDataChanged();
      await trigger(HAPTIC_EVENTS.questComplete);

      const undo = async () => {
        setUndoing(true);
        try {
          const undone = await ctx.progression.undoQuestCompletion(
            ctx.userId,
            result.completionId,
            unlocks.map(item => item.code),
          );
          if (!undone.success) throw new Error('Завершение уже было отменено');
          if (latestCompletionByQuest.current.get(quest.id) === result.completionId) {
            latestCompletionByQuest.current.delete(quest.id);
            setCompletedIds(current => {
              const next = new Set(current);
              next.delete(quest.id);
              return next;
            });
          }
          onDataChanged();
          try {
            await ctx.achievement.syncFromHistory(ctx.userId);
          } catch (value) {
            console.warn('[MiraiRPG] Achievement reconcile after undo failed:', value);
          }
          await trigger(HAPTIC_EVENTS.modalClose);
        } catch (value) {
          Alert.alert('Не удалось отменить', value instanceof Error ? value.message : String(value));
        } finally {
          setUndoing(false);
        }
      };

      const unlockSuffix = unlocks[0] ? ` · ${unlocks[0].name}` : '';
       onQuestCompleted({
         message: `Квест выполнен · +${result.xpAwarded} XP${unlockSuffix}`,
         achievementNames: unlocks.map(item => item.name),
         achievementCodes: unlocks.map(item => item.code),
         xpAwarded: result.xpAwarded,
         leveledUp: result.leveledUp,
         newLevel: result.newLevel,
         undo,
       });
      return true;
    } catch (value) {
      Alert.alert('Ошибка выполнения', value instanceof Error ? value.message : String(value));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const completeFromFocus = async (quest: QuestRow) => {
    const completed = await complete(quest);
    if (completed) setFocusQuest(null);
  };

  const confirmArchive = (quest: QuestRow) => {
    Alert.alert(
      'Удалить квест?',
      `«${quest.title}» исчезнет из списка. Завершения останутся в истории.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await ctx.quest.archive(quest.id);
              onDataChanged();
            } catch (value) {
              Alert.alert('Ошибка', value instanceof Error ? value.message : String(value));
            }
          },
        },
      ],
    );
  };

  const createQuest = async (data: {
    title: string;
    description: string | null;
    category: Category;
    difficulty: 1 | 2 | 3;
    xp_reward: number;
  }) => {
    // Throwing on failure is intentional: CreateQuestModal catches it,
    // keeps the form open and shows the reason. Swallowing the error
    // here is what used to look like "nothing happened".
    await ctx.quest.create(ctx.userId, {
      title: data.title,
      description: data.description ?? undefined,
      category: data.category,
      difficulty: data.difficulty,
      xp_reward: data.xp_reward,
    });
    // A new quest must be visible right away, so drop any active filter.
    setFilter('all');
    onDataChanged();
  };

  const renderQuest = ({ item }: { item: QuestRow }) => (
    <QuestCard
      quest={item}
      busy={busy === item.id}
      disabled={operationLocked}
      completed={completedIds.has(item.id)}
      onComplete={() => void complete(item)}
      onOpen={() => {
        setFocusQuest(item);
        void trigger(HAPTIC_EVENTS.modalOpen);
      }}
      onArchive={() => confirmArchive(item)}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.title, typography.title, { color: colors.text }]}>Квесты</Text>
            <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Выбери действие и преврати его в прогресс</Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.countValue, typography.numeric, { color: colors.accent }]}>{quests.length}</Text>
            <Text style={[styles.countLabel, typography.caption, { color: colors.textMuted }]}>активных</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.filters}
        >
          <FilterChip label="Все" active={filter === 'all'} onPress={() => setFilter('all')} />
          {CATEGORIES.map(category => (
            <FilterChip
              key={category}
              label={CATEGORY_LABELS[category]}
              active={filter === category}
              color={colors[`cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors]}
              onPress={() => setFilter(category)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.stateText, { color: colors.textMuted }]}>Загружаем квесты…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <LucideIcon name="cloud-off" size={34} color={colors.danger} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>Не удалось загрузить квесты</Text>
          <Text style={[styles.stateText, { color: colors.textMuted }]}>{error}</Text>
          <MotionPressable
            accessibilityRole="button"
            onPress={() => void reload()}
            style={[styles.retry, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
          </MotionPressable>
        </View>
      ) : (
        <FlatList
          data={quests}
          keyExtractor={item => item.id}
          renderItem={renderQuest}
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: BOTTOM_NAV_BASE_HEIGHT + insets.bottom + 96 },
          ]}
          ListHeaderComponent={
            quests.length > 0 ? (
              <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, typography.numeric, { color: colors.accent }]}>{summary.totalXp}</Text>
                  <Text style={[styles.summaryLabel, typography.caption, { color: colors.textMuted }]}>XP доступно</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, typography.numeric, { color: colors.text }]}>{quests.length}</Text>
                  <Text style={[styles.summaryLabel, typography.caption, { color: colors.textMuted }]}>квестов</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, typography.numeric, { color: colors.text }]}>{summary.custom}</Text>
                  <Text style={[styles.summaryLabel, typography.caption, { color: colors.textMuted }]}>своих</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceElevated }]}>
                <LucideIcon name="list-checks" size={34} color={colors.accent} />
              </View>
              <Text style={[styles.stateTitle, { color: colors.text }]}>В этой категории пока пусто</Text>
              <Text style={[styles.stateText, { color: colors.textMuted }]}>Добавь свой квест или выбери другую категорию</Text>
              <MotionPressable
                accessibilityRole="button"
                onPress={() => setShowCreate(true)}
                style={[styles.retry, { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Добавить квест</Text>
              </MotionPressable>
            </View>
          }
        />
      )}

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.fabHolder,
          {
            right: 16,
            bottom: BOTTOM_NAV_BASE_HEIGHT + insets.bottom + 16,
          },
        ]}
      >
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="Добавить квест"
          disabled={operationLocked}
          onPress={() => setShowCreate(true)}
          style={[
            styles.fab,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.pill,
              opacity: operationLocked ? 0.5 : 1,
            },
            fabStyle,
          ]}
        >
          <LucideIcon name="plus" size={28} color={colors.textInverse} strokeWidth={2.5} />
        </MotionPressable>
      </Animated.View>

      <CreateQuestModal visible={showCreate} onClose={() => setShowCreate(false)} onSubmit={createQuest} />
      <FocusModeModal
        visible={focusQuest !== null}
        quest={focusQuest}
        onClose={() => setFocusQuest(null)}
        onComplete={completeFromFocus}
      />
    </View>
  );
}

type QuestCardProps = {
  quest: QuestRow;
  busy: boolean;
  disabled: boolean;
  completed: boolean;
  onComplete: () => void;
  onOpen: () => void;
  onArchive: () => void;
};

function QuestCard({ quest, busy, disabled, completed, onComplete, onOpen, onArchive }: QuestCardProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const categoryColor = colors[`cat${quest.category.charAt(0).toUpperCase()}${quest.category.slice(1)}` as keyof typeof colors];
  const pressProgress = useSharedValue(1);
  const checkProgress = useSharedValue(1);
  const xpOpacity = useSharedValue(0);
  const xpOffset = useSharedValue(0);

  useEffect(() => {
    if (!completed) {
      pressProgress.value = reduced ? 1 : withTiming(1, { duration: duration.standard });
      checkProgress.value = 1;
      xpOpacity.value = 0;
      xpOffset.value = 0;
      return;
    }

    pressProgress.value = reduced
      ? 1
      : withSequence(
          withTiming(scale.cardPress, { duration: duration.micro, easing: Easing.out(Easing.cubic) }),
          withSpring(1, spring.card),
        );
    checkProgress.value = reduced
      ? 1
      : withSequence(
          withTiming(1.18, { duration: duration.micro, easing: Easing.out(Easing.cubic) }),
          withSpring(1, spring.celebration),
        );
    xpOpacity.value = reduced
      ? withDelay(180, withSequence(withTiming(1, { duration: duration.reducedMotion }), withDelay(180, withTiming(0, { duration: duration.reducedMotion }))))
      : withDelay(180, withSequence(withTiming(1, { duration: duration.micro }), withDelay(180, withTiming(0, { duration: duration.standard }))));
    xpOffset.value = reduced ? 0 : withDelay(180, withTiming(-28, { duration: duration.standard, easing: Easing.out(Easing.cubic) }));
  }, [checkProgress, completed, pressProgress, reduced, xpOffset, xpOpacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: reduced ? [] : [{ scale: pressProgress.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: reduced ? [] : [{ scale: checkProgress.value }],
  }));
  const xpStyle = useAnimatedStyle(() => ({
    opacity: xpOpacity.value,
    transform: reduced ? [] : [{ translateY: xpOffset.value }],
  }));
  const handleCardPressIn = () => {
    if (!reduced) pressProgress.value = withSpring(scale.cardPress, spring.card);
  };
  const handleCardPressOut = () => {
    if (!reduced) pressProgress.value = withSpring(1, spring.card);
  };

  return (
    <Animated.View
      style={[
        styles.questCard,
        {
          backgroundColor: completed ? `${colors.success}0D` : colors.surface,
          borderColor: completed ? `${colors.success}80` : colors.borderSubtle,
          borderRadius: radius.lg,
        },
        cardStyle,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.xpBurst, xpStyle]}>
        <Text style={[styles.xpBurstText, { color: colors.accent }]}>+{quest.xp_reward} XP</Text>
      </Animated.View>
      <View style={styles.questTop}>
        <View style={[styles.categoryIcon, { backgroundColor: `${categoryColor}20` }]}>
          <LucideIcon name={CATEGORY_ICONS[quest.category]} size={21} color={categoryColor} />
        </View>
        <View style={styles.questCopy}>
          <View style={styles.questHeading}>
            <Text numberOfLines={2} style={[styles.questTitle, typography.bodyStrong, { color: colors.text }]}>{quest.title}</Text>
            {quest.is_system === 0 ? (
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить ${quest.title}`}
                disabled={disabled}
                onPress={onArchive}
                onPressIn={handleCardPressIn}
                onPressOut={handleCardPressOut}
                hitSlop={10}
                style={[styles.archive, { opacity: disabled ? 0.5 : 1 }]}
              >
                <LucideIcon name="x" size={17} color={colors.textMuted} />
              </MotionPressable>
            ) : null}
          </View>
          {quest.description ? (
            <Text numberOfLines={2} style={[styles.description, typography.caption, { color: colors.textMuted }]}>{quest.description}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={[styles.categoryLabel, typography.caption, { color: categoryColor }]}>{CATEGORY_LABELS[quest.category]}</Text>
            <Text style={[styles.dot, { color: colors.textMuted }]}>•</Text>
            <Text style={[styles.meta, typography.caption, { color: colors.textMuted }]}>{DIFFICULTY_LABELS[quest.difficulty] ?? quest.difficulty}</Text>
            {quest.is_system === 0 ? <Text style={[styles.meta, typography.caption, { color: colors.textMuted }]}>• своё</Text> : null}
          </View>
        </View>
        <View style={styles.reward}>
          <Text style={[styles.rewardValue, typography.numeric, { color: colors.accent }]}>+{quest.xp_reward}</Text>
          <Text style={[styles.rewardLabel, typography.caption, { color: colors.textMuted }]}>XP</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <MotionPressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onOpen}
          onPressIn={handleCardPressIn}
          onPressOut={handleCardPressOut}
          style={[
            styles.detailsButton,
            { borderColor: colors.border, borderRadius: radius.sm, opacity: disabled ? 0.6 : 1 },
          ]}
        >
          <LucideIcon name="maximize-2" size={16} color={colors.textSecondary} />
          <Text style={[styles.detailsLabel, typography.caption, { color: colors.textSecondary }]}>Подробнее</Text>
        </MotionPressable>
        <MotionPressable
          accessibilityRole="button"
          accessibilityState={{ disabled, busy }}
          disabled={disabled}
          onPress={onComplete}
          onPressIn={handleCardPressIn}
          onPressOut={handleCardPressOut}
          style={[
            styles.completeButton,
            {
              backgroundColor: completed ? colors.successSoft : colors.accent,
              borderRadius: radius.sm,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : completed ? (
            <Animated.View style={[styles.completeContent, checkStyle]}>
              <LucideIcon name="check" size={17} color={colors.success} />
              <Text style={[styles.completeLabel, { color: colors.success }]}>Выполнено</Text>
            </Animated.View>
          ) : (
            <View style={styles.completeContent}>
              <LucideIcon name="check" size={17} color={colors.textInverse} />
              <Text style={[styles.completeLabel, { color: colors.textInverse }]}>Готово</Text>
            </View>
          )}
        </MotionPressable>
      </View>
      <MotionProgressBar
        value={completed ? 1 : 0}
        trackColor={colors.surfaceFloating}
        fillColor={completed ? colors.success : colors.accent}
        height={4}
        style={styles.completionProgress}
        accessibilityLabel={completed ? 'Квест выполнен' : 'Прогресс квеста'}
      />
    </Animated.View>
  );
}

function FilterChip({ label, active, color, onPress }: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const tint = color ?? colors.accent;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.filter,
        {
          backgroundColor: active ? `${tint}22` : colors.surface,
          borderColor: active ? `${tint}88` : colors.borderSubtle,
          borderRadius: radius.pill,
        },
      ]}
    >
      <Text style={[styles.filterLabel, typography.caption, { color: active ? tint : colors.textMuted, fontWeight: active ? '800' : '600' }]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 27, lineHeight: 34 },
  subtitle: { marginTop: 2 },
  countBadge: { minWidth: 66, height: 52, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  countValue: { fontSize: 18, lineHeight: 22 },
  countLabel: { fontSize: 10, lineHeight: 13 },
  filters: { gap: 8, paddingTop: 14, paddingRight: 16 },
  filter: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  filterLabel: { fontSize: 12, lineHeight: 16 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  stateTitle: { fontFamily: 'Nunito', fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  stateText: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { minHeight: 46, borderRadius: 14, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryLabel: { fontFamily: 'Nunito', fontSize: 14, fontWeight: '800' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingVertical: 12, marginBottom: 2 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, lineHeight: 22 },
  summaryLabel: { marginTop: 1 },
  summaryDivider: { width: 1, height: 30 },
  questCard: { borderWidth: 1, padding: 14, position: 'relative', overflow: 'hidden' },
  xpBurst: { position: 'absolute', top: 8, right: 14, zIndex: 2 },
  xpBurstText: { fontFamily: 'Nunito', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  completionProgress: { marginTop: 10 },
  questTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  categoryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  questCopy: { flex: 1, minWidth: 0 },
  questHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  questTitle: { flex: 1, fontSize: 15, lineHeight: 20 },
  archive: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  description: { marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  categoryLabel: { fontWeight: '800' },
  dot: { fontSize: 12 },
  meta: {},
  reward: { alignItems: 'flex-end', paddingLeft: 4 },
  rewardValue: { fontSize: 16, lineHeight: 20 },
  rewardLabel: { fontSize: 10, lineHeight: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  detailsButton: { minHeight: 42, paddingHorizontal: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailsLabel: { fontSize: 12, lineHeight: 16 },
  completeButton: { minWidth: 118, minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center' },
  completeContent: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  completeLabel: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 17, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 54, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  fabHolder: { position: 'absolute', zIndex: 20, elevation: 8 },
  fab: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
});
