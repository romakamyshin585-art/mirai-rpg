import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { AppContext } from '../app_context';
import type { QuestRow } from '../../repos/quest_repo';
import { CATEGORIES, type Category } from '../../domain/category';
import { BOTTOM_NAV_BASE_HEIGHT, CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import type { MorphOrigin } from '../components/Overlay';
import { CreateQuestModal } from '../create_quest_modal';
import { FocusModeModal } from '../components/FocusModeModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  /** Category filter pushed from Home (radar axis sheet). */
  filter?: Category | 'all' | null;
  onFilterConsumed?: () => void;
  /** A specific quest to open, e.g. from a recommendation on Home. */
  targetQuest?: { id: string; nonce: number } | null;
  onTargetConsumed?: () => void;
};

export function QuestsScreen({
  ctx,
  revision,
  onDataChanged,
  onQuestCompleted,
  filter,
  onFilterConsumed,
  targetQuest,
  onTargetConsumed,
}: QuestsScreenProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { trigger } = useHaptics();
  const reduced = useReducedMotion();
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [morphOrigin, setMorphOrigin] = useState<MorphOrigin | undefined>(undefined);
  const [pendingArchive, setPendingArchive] = useState<QuestRow | null>(null);
  // One shared value drives both the add icon and the sheet it opens, so
  // the two halves of the transition cannot drift apart.
  const createProgress = useSharedValue(0);
  const addHolderRef = useRef<View>(null);
  const [focusQuest, setFocusQuest] = useState<QuestRow | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const loadedOnce = useRef(false);
  const requestId = useRef(0);
  const latestCompletionByQuest = useRef(new Map<string, string>());
  const fabStyle = useAnimatedStyle(() => ({
    transform: reduced
      ? []
      : [
          { scale: 0.9 + createProgress.value * 0.1 },
          { rotate: `${45 * createProgress.value}deg` },
        ],
  }));
  const addGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + createProgress.value * 0.65,
    transform: reduced ? [] : [{ scale: 1 + createProgress.value * 0.55 }],
  }));

  /** Measure the add button so the sheet can unfold from exactly that point. */
  const openCreate = useCallback(() => {
    const node = addHolderRef.current;
    if (!node) {
      setShowCreate(true);
      return;
    }
    try {
      node.measureInWindow((x, y, width, height) => {
        const size = Math.max(width, height);
        setMorphOrigin(size > 0 ? { x, y, size } : undefined);
        setShowCreate(true);
      });
    } catch {
      setMorphOrigin(undefined);
      setShowCreate(true);
    }
  }, []);

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const rows = await ctx.quest.list(ctx.userId, activeFilter === 'all' ? undefined : { category: activeFilter });
      if (currentRequest === requestId.current) setQuests(rows);
      loadedOnce.current = true;
    } catch (value) {
      if (currentRequest === requestId.current) setError(value instanceof Error ? value.message : String(value));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [ctx, activeFilter]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  // Filter pushed from Home's radar axis sheet.
  useEffect(() => {
    if (filter === undefined || filter === null) return;
    setActiveFilter(filter);
    onFilterConsumed?.();
  }, [filter, onFilterConsumed]);

  /**
   * Quest hand-off from Home. The quest may not be in the list yet (the
   * screen mounts and loads asynchronously, and a pushed filter could hide
   * it), so the request is parked until the list contains it. Clearing the
   * filter first guarantees a single code path.
   */
  useEffect(() => {
    if (!targetQuest) return;
    if (activeFilter !== 'all') setActiveFilter('all');
  }, [targetQuest, activeFilter]);

  useEffect(() => {
    if (!targetQuest || quests.length === 0) return;
    const match = quests.find(quest => quest.id === targetQuest.id);
    if (!match) return;
    setActiveFilter('all');
    setHighlightId(match.id);
    setFocusQuest(match);
    void trigger(HAPTIC_EVENTS.modalOpen);
    const timer = setTimeout(() => setHighlightId(null), 900);
    onTargetConsumed?.();
    return () => clearTimeout(timer);
  }, [onTargetConsumed, quests, targetQuest, trigger]);

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
    setPendingArchive(quest);
  };

  const runArchive = async () => {
    const quest = pendingArchive;
    if (!quest) return;
    try {
      await ctx.quest.archive(quest.id);
      setPendingArchive(null);
      onDataChanged();
    } catch (value) {
      setPendingArchive(null);
      Alert.alert('Ошибка', value instanceof Error ? value.message : String(value));
    }
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
    setActiveFilter('all');
    onDataChanged();
  };

  const renderQuest = ({ item }: { item: QuestRow }) => (
    <QuestCard
      quest={item}
      busy={busy === item.id}
      disabled={operationLocked}
      completed={completedIds.has(item.id)}
      highlighted={highlightId === item.id}
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
          <View style={styles.titleCopy}>
            <Text style={[styles.title, typography.title, { color: colors.text }]}>Квесты</Text>
            <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Выбери действие и преврати его в прогресс</Text>
          </View>
          <Animated.View
            pointerEvents="box-none"
            ref={addHolderRef}
            collapsable={false}
            style={styles.addHolder}
          >
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Добавить квест"
              disabled={operationLocked}
              onPress={openCreate}
              style={[
                styles.addButton,
                {
                  backgroundColor: colors.accentSoft,
                  borderColor: `${colors.accent}66`,
                  borderRadius: radius.pill,
                  opacity: operationLocked ? 0.5 : 1,
                },
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.addGlow, { backgroundColor: colors.accent }, addGlowStyle]}
              />
              <Animated.View style={fabStyle}>
                <LucideIcon name="plus" size={23} color={colors.accent} strokeWidth={2.7} />
              </Animated.View>
            </MotionPressable>
          </Animated.View>
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.countValue, typography.numeric, { color: colors.accent }]}>{quests.length}</Text>
            <Text style={[styles.countLabel, typography.caption, { color: colors.textMuted }]}>активных</Text>
          </View>
        </View>
        <FilterRow value={activeFilter} onChange={setActiveFilter} />
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
          maxToRenderPerBatch={8}
          windowSize={9}
          // `removeClippedSubviews` is deliberately NOT enabled. On
          // Android/Fabric it detaches rows that are still on screen and
          // never re-attaches them reliably, which is exactly the "scroll
          // down and the whole list turns into background" report. The
          // list is windowed, so the memory argument for it does not
          // apply here anyway.
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: BOTTOM_NAV_BASE_HEIGHT + insets.bottom + 32 },
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

      <CreateQuestModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={createQuest}
        morphOrigin={morphOrigin}
        sharedProgress={createProgress}
      />
      <FocusModeModal
        visible={focusQuest !== null}
        quest={focusQuest}
        onClose={() => setFocusQuest(null)}
        onComplete={completeFromFocus}
      />
      <ConfirmDialog
        visible={pendingArchive !== null}
        title="Удалить квест?"
        subject={pendingArchive ? `«${pendingArchive.title}»` : ''}
        message="Квест исчезнет из списка. Завершения останутся в истории и в календаре."
        icon="trash-2"
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        onConfirm={() => void runArchive()}
        onCancel={() => setPendingArchive(null)}
      />
    </View>
  );
}

type QuestCardProps = {
  quest: QuestRow;
  busy: boolean;
  disabled: boolean;
  completed: boolean;
  /** Arrived here from a Home recommendation — give it a one-shot glow. */
  highlighted?: boolean;
  onComplete: () => void;
  onOpen: () => void;
  onArchive: () => void;
};

function QuestCard({ quest, busy, disabled, completed, highlighted = false, onComplete, onOpen, onArchive }: QuestCardProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const categoryColor = colors[`cat${quest.category.charAt(0).toUpperCase()}${quest.category.slice(1)}` as keyof typeof colors];
  const pressProgress = useSharedValue(1);
  const checkProgress = useSharedValue(1);
  const xpOpacity = useSharedValue(0);
  const xpOffset = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    if (!highlighted) {
      halo.value = withTiming(0, { duration: duration.micro });
      return;
    }
    // Hand-off glow: rise, hold, fade. One shot, no loop.
    halo.value = reduced
      ? withSequence(
          withTiming(1, { duration: duration.reducedMotion }),
          withDelay(320, withTiming(0, { duration: duration.reducedMotion })),
        )
      : withSequence(
          withTiming(1, { duration: duration.micro, easing: Easing.out(Easing.cubic) }),
          withDelay(320, withTiming(0, { duration: duration.major, easing: Easing.in(Easing.cubic) })),
        );
  }, [halo, highlighted, reduced]);

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
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value,
    transform: reduced ? [] : [{ scale: 0.985 + halo.value * 0.015 }],
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
    <Animated.View style={styles.questCardHaloWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.questCardHalo,
          { borderRadius: radius.lg, backgroundColor: `${colors.accent}1F`, borderColor: colors.accent },
          haloStyle,
        ]}
      />
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
    </Animated.View>
  );
}

/**
 * Category filter row.
 *
 * The active chip used to be distinguished only by a colour swap, so a tap
 * on a neighbouring chip read as an instant repaint. The selection now
 * travels: a tinted pill slides between chips and resizes to the target,
 * which is the same "one object moved" trick the tab bar uses.
 */
function FilterRow({
  value,
  onChange,
}: {
  value: Category | 'all';
  onChange: (next: Category | 'all') => void;
}) {
  const { colors, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const options: Array<{ key: Category | 'all'; label: string; color: string }> = useMemo(
    () => [
      { key: 'all' as const, label: 'Все', color: colors.accent },
      ...CATEGORIES.map(category => ({
        key: category,
        label: CATEGORY_LABELS[category],
        color: colors[`cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors],
      })),
    ],
    [colors],
  );
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const ready = widths[value] !== undefined;

  useEffect(() => {
    const x = offsets[value];
    const w = widths[value];
    if (x === undefined || w === undefined) return;
    if (reduced) {
      pillX.value = x;
      pillW.value = w;
      return;
    }
    pillX.value = withSpring(x, spring.navigation);
    pillW.value = withSpring(w, spring.navigation);
  }, [offsets, pillW, pillX, reduced, value, widths]);

  const pillStyle = useAnimatedStyle(() => ({
    width: pillW.value,
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.filters}
    >
      {options.map(option => {
        const active = option.key === value;
        return (
          <MotionPressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.key)}
            onLayout={event => {
              const { x, width } = event.nativeEvent.layout;
              setWidths(current => (current[option.key] === width ? current : { ...current, [option.key]: width }));
              setOffsets(current => (current[option.key] === x ? current : { ...current, [option.key]: x }));
            }}
            style={styles.filterHit}
          >
            <Text
              style={[
                styles.filterLabel,
                typography.caption,
                {
                  color: active ? colors.text : colors.textMuted,
                  fontWeight: active ? '800' : '600',
                },
              ]}
            >
              {option.label}
            </Text>
          </MotionPressable>
        );
      })}
      {ready ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.filterPill,
            {
              backgroundColor: `${options.find(option => option.key === value)?.color ?? colors.accent}22`,
              borderColor: `${options.find(option => option.key === value)?.color ?? colors.accent}88`,
            },
            pillStyle,
          ]}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 27, lineHeight: 34 },
  subtitle: { marginTop: 2 },
  countBadge: { minWidth: 66, height: 52, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  countValue: { fontSize: 18, lineHeight: 22 },
  countLabel: { fontSize: 10, lineHeight: 13 },
  filters: { gap: 8, paddingTop: 14, paddingRight: 16, paddingLeft: 4 },
  filterHit: { height: 40, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  filterPill: { position: 'absolute', top: 14, left: 0, height: 40, borderRadius: 20, borderWidth: 1 },
  filterLabel: { fontSize: 12, lineHeight: 16 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  stateTitle: { fontFamily: 'Nunito', fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  stateText: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { minHeight: 46, borderRadius: 16, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryLabel: { fontFamily: 'Nunito', fontSize: 14, fontWeight: '800' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingVertical: 12, marginBottom: 2 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, lineHeight: 22 },
  summaryLabel: { marginTop: 1 },
  summaryDivider: { width: 1, height: 30 },
  questCardHaloWrap: { position: 'relative' },
  questCardHalo: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderWidth: 1.5 },
  questCard: { borderWidth: 1, padding: 14, position: 'relative', overflow: 'hidden' },
  xpBurst: { position: 'absolute', top: 8, right: 14, zIndex: 2 },
  xpBurstText: { fontFamily: 'Nunito', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  completionProgress: { marginTop: 10 },
  questTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  categoryIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  // The add control lives in the header row: a corner FAB floated over
  // the list and sat on top of a card's "Готово" button, which is what
  // made the screen feel crowded. In the header it competes with nothing.
  addHolder: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 46, height: 46, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  addGlow: { position: 'absolute', width: 46, height: 46, borderRadius: 23, opacity: 0.3 },
});
