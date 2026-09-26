/**
 * Home — the app's main tab.
 *
 * Structure decision (night-run §4). Profile was merged into Home and
 * the Profile tab removed, because after moving its unique parts here
 * nothing was left that was not either duplicated or noise:
 *
 *   Profile block            -> decision
 *   ------------------------------------------------------------------------
 *   hero card (avatar, XP)   -> dropped, Home already has the level card
 *   radar chart              -> moved here (it is the visual centrepiece)
 *   category grid            -> dropped, duplicates the radar + today's list
 *   achievements progress    -> compact entry in the header row
 *   personal bests           -> collapsible "Рекорды" block here
 *   recent activity          -> collapsible "Активность" block here
 *
 * Progressive disclosure: everything below the level card is a separate
 * block and the two history blocks start collapsed, so the first screen
 * shows the essentials instead of a wall of widgets.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import { CompletionRepo, type QuestRow } from '../../repos/quest_repo';
import type { CharacterRow, StatRow } from '../../repos/character_repo';
import type { RecentActivityItem } from '../../services/quest_service';
import { CATEGORIES, type Category } from '../../domain/category';
import { levelProgress } from '../../domain/level';
import {
  axisStatsFromRows,
  emptyAxisStats,
  recommend,
  type AxisStats,
  type ScoredQuest,
} from '../../domain/recommendations';
import { buildWeeklyReport, type WeeklyReport } from '../../domain/weekly_report';
import { BOTTOM_NAV_BASE_HEIGHT, CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { RadarChart, type RadarData } from '../components/RadarChart';
import { CategoryInsightSheet, type AxisInsight } from '../components/CategoryInsightSheet';
import { MotionPressable } from '../components/MotionPressable';
import { MotionNumber } from '../components/MotionNumber';
import { MotionProgressBar } from '../components/MotionProgressBar';
import { MotionReveal } from '../components/MotionReveal';
import { CrystalMark } from '../components/CrystalMark';
import { duration, spring, useReducedMotion, useScrollHeader } from '../motion';

const DAILY_GOAL = 5;
const RECOMMENDATION_COUNT = 3;
const DISMISS_KEY = 'mirai.dismissedQuests';
const SHOWN_KEY = 'mirai.recommendedQuests';

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

const CLASS_LABELS: Record<string, string> = {
  warrior: 'Воин',
  scholar: 'Учёный',
  builder: 'Строитель',
  monk: 'Монах',
  leader: 'Лидер',
};

const CLASS_ICONS: Record<string, string> = {
  warrior: 'sword',
  scholar: 'book-open',
  builder: 'hammer',
  monk: 'circle',
  leader: 'crown',
};

type HomeScreenProps = {
  ctx: AppContext;
  revision: number;
  onOpenQuests: () => void;
  onOpenQuest: (questId: string) => void;
  onOpenAchievements: () => void;
  /** Jump to the quest list pre-filtered by axis. */
  onOpenQuestsForCategory?: (category: Category) => void;
};

type DismissalStore = {
  dismissed: string[];
  shown: Record<string, number>;
};

function readDismissals(): DismissalStore {
  // Non-critical preference: a broken/absent storage must never take the
  // screen down, so every access is guarded.
  try {
    const raw = globalThis.localStorage?.getItem(DISMISS_KEY);
    const shownRaw = globalThis.localStorage?.getItem(SHOWN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const shown = shownRaw ? JSON.parse(shownRaw) : {};
    return {
      dismissed: Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [],
      shown: shown && typeof shown === 'object' ? shown : {},
    };
  } catch {
    return { dismissed: [], shown: {} };
  }
}

function writeShown(shown: Record<string, number>) {
  try {
    globalThis.localStorage?.setItem(SHOWN_KEY, JSON.stringify(shown));
  } catch {
    // ignore
  }
}

function persistDismissed(dismissed: string[]) {
  try {
    globalThis.localStorage?.setItem(DISMISS_KEY, JSON.stringify(dismissed));
  } catch {
    // ignore
  }
}

export function HomeScreen({ ctx, revision, onOpenQuests, onOpenQuest, onOpenAchievements, onOpenQuestsForCategory }: HomeScreenProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { onScroll: onHeaderScroll, style: headerStyle } = useScrollHeader();
  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [todayXp, setTodayXp] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [streak, setStreak] = useState(0);
  const [activeQuests, setActiveQuests] = useState<QuestRow[]>([]);
  const [nextQuest, setNextQuest] = useState<QuestRow | null>(null);
  const [recommendations, setRecommendations] = useState<ScoredQuest[]>([]);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyXpByCategory, setWeeklyXpByCategory] = useState<Record<string, number>>({});
  const [unlocked, setUnlocked] = useState(0);
  const [totalAchievements, setTotalAchievements] = useState(0);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [personalBests, setPersonalBests] = useState<Array<{ scope: string; value: number; achieved_at: string }>>([]);
  const [showRecords, setShowRecords] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [axisSheet, setAxisSheet] = useState<Category | null>(null);
  const [jumping, setJumping] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [shownCounts, setShownCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countedRef = useRef(new Set<string>());

  useEffect(() => {
    const store = readDismissals();
    setDismissed(store.dismissed);
    setShownCounts(store.shown);
  }, []);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const char = await ctx.character.get(ctx.userId);
      if (!char) throw new Error('Персонаж не найден');
      const weekFrom = new Date();
      weekFrom.setDate(weekFrom.getDate() - 7);
      const [characterStats, todayProgress, quests, currentStreak, completions, catalog, unlockedRows, bests, activity] =
        await Promise.all([
          ctx.character.getStats(char.id),
          ctx.quest.getTodayProgress(ctx.userId),
          ctx.quest.list(ctx.userId),
          ctx.quest.getStreak(ctx.userId),
          new CompletionRepo(ctx.db).listBetween(ctx.userId, weekFrom, new Date()),
          ctx.achievement.listCatalog(),
          ctx.achievement.listUnlocked(ctx.userId),
          ctx.achievement.listPersonalBests(ctx.userId),
          ctx.quest.getRecentActivity(ctx.userId, 6),
        ]);

      const axisStats: AxisStats = axisStatsFromRows(characterStats);
      const ranked = recommend({
        stats: axisStats,
        level: char.level,
        quests: quests.map(quest => ({
          id: quest.id,
          title: quest.title,
          category: quest.category,
          difficulty: quest.difficulty,
          xpReward: quest.xp_reward,
        })),
        shownCounts,
        dismissed,
        limit: RECOMMENDATION_COUNT,
      });

      setCharacter(char);
      setStats(characterStats);
      setTodayXp(todayProgress.todayXp);
      setCompletedToday(todayProgress.completedToday);
      setStreak(currentStreak);
      setActiveQuests(quests);
      setNextQuest(quests[0] ?? null);
      setRecommendations(ranked);
      setUnlocked(unlockedRows.length);
      setTotalAchievements(catalog.length);
      setPersonalBests(bests);
      setRecentActivity(activity);
      setWeekly(
        buildWeeklyReport({
          completions: completions.map(row => ({
            completedAt: row.completed_at,
            category: row.category,
            xp: row.xp_awarded,
          })),
          unlocks: unlockedRows.map(row => ({ code: row.code, name: row.name, unlockedAt: row.unlockedAt })),
          axisTotals: Object.keys(axisStats).length > 0 ? axisStats : emptyAxisStats(),
          nextWeekHint: ranked[0]?.reason ?? null,
        }),
      );

      const weeklyXp: Record<string, number> = {};
      for (const row of completions) {
        weeklyXp[row.category] = (weeklyXp[row.category] ?? 0) + row.xp_awarded;
      }
      setWeeklyXpByCategory(weeklyXp);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ctx, dismissed, shownCounts]);

  useEffect(() => {
    void loadData();
  }, [loadData, revision]);

  // Count each recommendation once per session so `freshness` can start
  // working from the second visit onwards.
  useEffect(() => {
    if (recommendations.length === 0) return;
    const fresh = recommendations.filter(item => !countedRef.current.has(item.quest.id));
    if (fresh.length === 0) return;
    fresh.forEach(item => countedRef.current.add(item.quest.id));
    setShownCounts(current => {
      const next = { ...current };
      fresh.forEach(item => {
        next[item.quest.id] = (next[item.quest.id] ?? 0) + 1;
      });
      writeShown(next);
      return next;
    });
  }, [recommendations]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const dismiss = (questId: string) => {
    setDismissed(current => {
      const next = current.includes(questId) ? current : [...current, questId];
      persistDismissed(next);
      return next;
    });
    setRecommendations(current => current.filter(item => item.quest.id !== questId));
  };

  /**
   * Recommendation tap: hand the quest to the quest tab instead of just
   * opening the list. The card plays a one-shot "lift" so the tap reads
   * as a departure rather than a no-op, then the tab transition takes
   * over.
   */
  const openRecommendation = (questId: string) => {
    setJumping(questId);
    setTimeout(() => {
      setJumping(null);
      onOpenQuest(questId);
    }, 170);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <CrystalMark size={92} />
        <Text style={[styles.loading, { color: colors.textMuted }]}>Собираем твой прогресс…</Text>
      </View>
    );
  }

  if (!character || error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <LucideIcon name="cloud-off" size={38} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Главная временно недоступна</Text>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>{error ?? 'Не удалось загрузить данные'}</Text>
        <MotionPressable
          accessibilityRole="button"
          onPress={() => void loadData()}
          style={[styles.retry, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
        </MotionPressable>
      </View>
    );
  }

  const progress = levelProgress(character.xp);
  const goalProgress = Math.min(1, completedToday / DAILY_GOAL);
  const greeting = getGreeting();
  const classLabel = character.class ? CLASS_LABELS[character.class] ?? character.class : 'Путь ещё не выбран';
  const maxAxisXp = Math.max(100, ...stats.map(stat => stat.xp_total_in_category));
  const radarData: RadarData[] = CATEGORIES.map(category => {
    const stat = stats.find(item => item.category === category);
    return {
      category,
      value: Math.min(1, (stat?.xp_total_in_category ?? 0) / maxAxisXp),
      xp: stat?.xp_total_in_category ?? 0,
      questsCompleted: stat?.value ?? 0,
      weeklyChange: 0,
    };
  });
  const achievementProgress = totalAchievements > 0 ? Math.round((unlocked / totalAchievements) * 100) : 0;
  const achievementsHint = totalAchievements > 0 ? `${achievementProgress}% открыто` : 'Нет наград';
  // Per-axis detail for the radar's tap target. All-time numbers come
  // from the stat rows the screen already loaded; the 7-day delta comes
  // from the same completions window the weekly report uses.
  const axisInsights = useMemo<Record<Category, AxisInsight>>(() => {
    const result = {} as Record<Category, AxisInsight>;
    for (const category of CATEGORIES) {
      const stat = stats.find(item => item.category === category);
      result[category] = {
        xp: stat?.xp_total_in_category ?? 0,
        questsCompleted: stat?.value ?? 0,
        weeklyXp: weeklyXpByCategory[category] ?? 0,
      };
    }
    return result;
  }, [stats, weeklyXpByCategory]);

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
          <View style={styles.headingCopy}>
            <Text style={[styles.greeting, typography.caption, { color: colors.textMuted }]}>{greeting}</Text>
            <Text style={[styles.name, typography.title, { color: colors.text }]}>{character.name || 'Hero'}</Text>
          </View>
          <View style={styles.headingActions}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={`Достижения: ${unlocked} из ${totalAchievements}, ${achievementsHint}`}
              onPress={onOpenAchievements}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
            >
              <LucideIcon name="trophy" size={20} color={colors.accent} />
              <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.iconBadgeText, { color: colors.textInverse }]}>{unlocked}</Text>
              </View>
            </MotionPressable>
            <View style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.surfaceElevated }]}>
              <CrystalMark size={32} animated={false} />
              <View style={[styles.levelDot, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
                <MotionNumber key={`level-${character.level}`} value={character.level} style={[styles.levelDotText, { color: colors.textInverse }]} />
              </View>
            </View>
          </View>
        </View>
      </Animated.View>

      <MotionReveal index={0}>
        <View style={[styles.playerCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.xl }]}>
          <View style={styles.playerTop}>
            <View style={styles.playerIdentity}>
              <View style={styles.classRow}>
                <LucideIcon name={CLASS_ICONS[character.class ?? ''] ?? 'sparkles'} size={14} color={colors.accent} />
                <Text style={[styles.classLabel, typography.caption, { color: colors.accent }]}>{classLabel}</Text>
              </View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {progress.xp_into_level} / {progress.xp_for_next_level} XP до уровня {character.level + 1}
              </Text>
            </View>
            <View style={[styles.levelBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.levelText, typography.numeric, { color: colors.accent }]}>LV {character.level}</Text>
            </View>
          </View>
          <MotionProgressBar
            value={progress.level_progress_pct / 100}
            trackColor={colors.surfaceFloating}
            fillColor={colors.accent}
            height={7}
            style={styles.xpTrack}
            accessibilityLabel="Прогресс уровня"
          />
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <LucideIcon name="zap" size={16} color={colors.accent} />
              <MotionNumber key={`today-xp-${todayXp}`} value={todayXp} style={[styles.metricValue, typography.numeric, { color: colors.text }]} />
              <Text style={[typography.caption, { color: colors.textMuted }]}>XP сегодня</Text>
            </View>
            <View style={styles.metric}>
              <LucideIcon name="flame" size={16} color={colors.warning} />
              <MotionNumber key={`streak-${streak}`} value={streak} style={[styles.metricValue, typography.numeric, { color: colors.text }]} />
              <Text style={[typography.caption, { color: colors.textMuted }]}>дней подряд</Text>
            </View>
            <View style={styles.metric}>
              <LucideIcon name="list-checks" size={16} color={colors.success} />
              <Text style={[styles.metricValue, typography.numeric, { color: colors.text }]}>{completedToday}/{DAILY_GOAL}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>задач дня</Text>
            </View>
          </View>
        </View>
      </MotionReveal>

      <MotionReveal index={1}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>Характеристики</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Нажми на область, чтобы раскрыть</Text>
            </View>
            <LucideIcon name="radar" size={20} color={colors.catDiscipline} />
          </View>
          <RadarChart data={radarData} selected={axisSheet} onSelect={category => setAxisSheet(category)} />
        </View>
      </MotionReveal>

      {weekly ? (
        <MotionReveal index={2}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>Итоги недели</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Приватно, только для тебя</Text>
              </View>
              <LucideIcon name="calendar-check" size={20} color={colors.catKnowledge} />
            </View>
            {weekly.isEmpty ? (
              <View style={styles.weeklyEmpty}>
                <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
                  Пока нет завершений за 7 дней. Выполни первый квест — и здесь появится сводка.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.weeklyStats}>
                  <View style={styles.weeklyStat}>
                    <Text style={[styles.weeklyValue, typography.numeric, { color: colors.accent }]}>{weekly.totalXp}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>XP</Text>
                  </View>
                  <View style={styles.weeklyStat}>
                    <Text style={[styles.weeklyValue, typography.numeric, { color: colors.text }]}>{weekly.completions}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>квестов</Text>
                  </View>
                  <View style={styles.weeklyStat}>
                    <Text style={[styles.weeklyValue, typography.numeric, { color: colors.text }]}>{weekly.longestStreak}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>серия</Text>
                  </View>
                </View>
                <View style={styles.weeklyAxes}>
                  {weekly.axes.map(axis => {
                    const axisColor = colors[`cat${axis.category.charAt(0).toUpperCase()}${axis.category.slice(1)}` as keyof typeof colors];
                    return (
                      <View key={axis.category} style={styles.weeklyAxis}>
                        <Text style={[typography.caption, { color: colors.textSecondary, width: 86 }]} numberOfLines={1}>
                          {CATEGORY_LABELS[axis.category]}
                        </Text>
                        <MotionProgressBar
                          value={axis.share}
                          trackColor={colors.surfaceFloating}
                          fillColor={axisColor}
                          height={6}
                          style={styles.weeklyAxisTrack}
                          accessibilityLabel={`${CATEGORY_LABELS[axis.category]}: +${axis.gained} XP`}
                        />
                        <Text style={[typography.caption, { color: axisColor, width: 46, textAlign: 'right' }]}>
                          +{axis.gained}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {weekly.achievement ? (
                  <View style={[styles.weeklyBadge, { backgroundColor: colors.accentSoft }]}>
                    <LucideIcon name="trophy" size={16} color={colors.accent} />
                    <Text style={[typography.caption, { color: colors.accent, flex: 1 }]} numberOfLines={1}>
                      Ачивмент недели: {weekly.achievement.name}
                    </Text>
                  </View>
                ) : null}
                {weekly.nextWeekHint ? (
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
                    На неделю вперёд: {weekly.nextWeekHint}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </MotionReveal>
      ) : null}

      {recommendations.length > 0 ? (
        <MotionReveal index={3}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>Куда расти</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Нажми — откроется квест</Text>
              </View>
              <LucideIcon name="compass" size={20} color={colors.accent} />
            </View>
            {recommendations.map((item, index) => {
              const axisColor = colors[`cat${item.quest.category.charAt(0).toUpperCase()}${item.quest.category.slice(1)}` as keyof typeof colors];
              const leaving = jumping === item.quest.id;
              return (
                <RecommendationRow
                  key={item.quest.id}
                  index={index}
                  title={item.quest.title}
                  reason={item.reason}
                  category={item.quest.category}
                  xp={item.quest.xpReward}
                  color={axisColor}
                  leaving={leaving}
                  onOpen={() => openRecommendation(item.quest.id)}
                  onDismiss={() => dismiss(item.quest.id)}
                />
              );
            })}
            <MotionPressable
              accessibilityRole="button"
              onPress={onOpenQuests}
              style={styles.seeAll}
            >
              <Text style={[typography.caption, { color: colors.accent, fontWeight: '800' }]}>Все квесты</Text>
              <LucideIcon name="chevron-right" size={15} color={colors.accent} />
            </MotionPressable>
          </View>
        </MotionReveal>
      ) : null}

      <MotionReveal index={4}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Сегодня</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {completedToday} из {DAILY_GOAL} выполнено · {activeQuests.length} доступно
            </Text>
          </View>
        </View>
        <MotionProgressBar
          value={goalProgress}
          trackColor={colors.surfaceFloating}
          fillColor={colors.accent}
          height={6}
          style={styles.goalTrack}
          accessibilityLabel="Прогресс дневной цели"
        />
        {nextQuest ? (
          <MotionPressable
            accessibilityRole="button"
            onPress={onOpenQuests}
            style={[styles.nextCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}
          >
            <View style={[styles.nextIcon, { backgroundColor: `${colors.catCareer}20` }]}>
              <LucideIcon name="scroll-text" size={21} color={colors.catCareer} />
            </View>
            <View style={styles.nextCopy}>
              <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>{nextQuest.title}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {CATEGORY_LABELS[nextQuest.category]} · сложность {nextQuest.difficulty}/3
              </Text>
            </View>
            <View style={styles.nextReward}>
              <Text style={[typography.numeric, { color: colors.accent }]}>+{nextQuest.xp_reward}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>XP</Text>
            </View>
          </MotionPressable>
        ) : (
          <MotionPressable
            accessibilityRole="button"
            onPress={onOpenQuests}
            style={[styles.nextCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}
          >
            <View style={styles.nextCopy}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>Добавь первый квест</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Открой Квесты и начни путь</Text>
            </View>
            <LucideIcon name="plus" size={22} color={colors.accent} />
          </MotionPressable>
        )}
      </MotionReveal>

      {personalBests.length > 0 ? (
        <MotionReveal index={5}>
          <CollapsibleBlock
            title="Рекорды"
            hint="Лучшие результаты"
            icon="trophy"
            expanded={showRecords}
            onToggle={() => setShowRecords(value => !value)}
          >
            <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}>
              {personalBests.slice(0, 5).map((record, index) => (
                <View
                  key={record.scope}
                  style={[
                    styles.listRow,
                    index > 0 ? { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth } : null,
                  ]}
                >
                  <View style={[styles.listIcon, { backgroundColor: colors.accentSoft }]}>
                    <LucideIcon name={record.scope === 'day' ? 'sun' : 'trophy'} size={16} color={colors.accent} />
                  </View>
                  <View style={styles.listCopy}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatRecordScope(record.scope)}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {new Date(record.achieved_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={[typography.numericSmall, { color: colors.accent }]}>{record.value} XP</Text>
                </View>
              ))}
            </View>
          </CollapsibleBlock>
        </MotionReveal>
      ) : null}

      {recentActivity.length > 0 ? (
        <MotionReveal index={6}>
          <CollapsibleBlock
            title="Активность"
            hint="Последние завершения"
            icon="history"
            expanded={showActivity}
            onToggle={() => setShowActivity(value => !value)}
          >
            <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}>
              {recentActivity.slice(0, 6).map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.listRow,
                    index > 0 ? { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth } : null,
                  ]}
                >
                  <View style={[styles.listIcon, { backgroundColor: colors.successSoft }]}>
                    <LucideIcon name="check" size={15} color={colors.success} />
                  </View>
                  <View style={styles.listCopy}>
                    <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>{item.title}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                  {item.xp ? <Text style={[typography.numericSmall, { color: colors.accent }]}>+{item.xp}</Text> : null}
                </View>
              ))}
            </View>
          </CollapsibleBlock>
        </MotionReveal>
      ) : null}
    </Animated.ScrollView>

    <CategoryInsightSheet
      category={axisSheet}
      insights={axisInsights}
      onClose={() => setAxisSheet(null)}
      onOpenQuests={category => {
        setAxisSheet(null);
        if (onOpenQuestsForCategory) onOpenQuestsForCategory(category);
        else onOpenQuests();
      }}
    />
    </>
  );
}

/**
 * One recommendation row.
 *
 * Tapping the body is the primary action — it hands the quest to the quest
 * tab and opens it there — so the whole row is a button and only the
 * trailing "x" is a separate target. `leaving` drives the hand-off: the row
 * lifts, brightens and shrinks for ~170ms before the tab change, which is
 * what makes the jump feel like the card travelled rather than the screen
 * teleported.
 */
function RecommendationRow({
  index,
  title,
  reason,
  category,
  xp,
  color,
  leaving,
  onOpen,
  onDismiss,
}: {
  index: number;
  title: string;
  reason: string;
  category: Category;
  xp: number;
  color: string;
  leaving: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const entrance = useSharedValue(0);
  const press = useSharedValue(0);

  useEffect(() => {
    entrance.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withDelay(70 + index * 80, withSpring(1, spring.card));
  }, [entrance, index, reduced]);

  const style = useAnimatedStyle(() => {
    if (leaving) {
      // Hand-off: rise, shrink, fade. Runs on the UI thread so it is not
      // at the mercy of the tab switch that follows.
      return reduced
        ? { opacity: withTiming(0, { duration: duration.reducedMotion }) }
        : {
            opacity: withTiming(0, { duration: duration.standard, easing: Easing.in(Easing.cubic) }),
            transform: [
              { translateY: withTiming(-26, { duration: duration.standard, easing: Easing.in(Easing.cubic) }) },
              { scale: withTiming(0.9, { duration: duration.standard, easing: Easing.in(Easing.cubic) }) },
            ],
          };
    }
    return {
      opacity: entrance.value,
      transform: reduced
        ? [{ scale: 1 - press.value * 0.02 }]
        : [
            { translateY: (1 - entrance.value) * 14 },
            { scale: (0.96 + entrance.value * 0.04) * (1 - press.value * 0.02) },
          ],
    };
  });

  return (
    <Animated.View style={style}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`Открыть квест: ${title}, ${xp} XP`}
        onPress={onOpen}
        onPressIn={() => {
          if (!reduced) press.value = withSpring(1, spring.card);
        }}
        onPressOut={() => {
          if (!reduced) press.value = withSpring(0, spring.card);
        }}
        style={[
          styles.recommendation,
          {
            backgroundColor: leaving ? `${color}14` : colors.surfaceElevated,
            borderColor: leaving ? color : colors.borderSubtle,
            borderRadius: radius.md,
          },
        ]}
      >
        <View style={[styles.recommendationIcon, { backgroundColor: `${color}20` }]}>
          <LucideIcon name={CATEGORY_ICONS[category]} size={18} color={color} />
        </View>
        <View style={styles.recommendationCopy}>
          <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
            {reason}
          </Text>
        </View>
        <View style={styles.recommendationSide}>
          <Text style={[typography.numericSmall, { color: colors.accent }]}>+{xp}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Не интересно: ${title}`}
            hitSlop={10}
            onPress={onDismiss}
            style={styles.dismiss}
          >
            <LucideIcon name="x" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </MotionPressable>
    </Animated.View>
  );
}
/**
 * Disclosure block.
 *
 * The body used to mount and unmount instantly, which read as a glitch on a
 * long scroll. It now measures itself once per expansion and animates to
 * the real height, so a card unfolds under the finger instead of appearing.
 * The chevron rotates on the same value, which is what ties the two halves
 * of the control together.
 */
function CollapsibleBlock({
  title,
  hint,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { colors, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const progress = useSharedValue(expanded ? 1 : 0);
  const [mounted, setMounted] = useState(expanded);

  useEffect(() => {
    if (expanded) {
      setMounted(true);
      progress.value = reduced ? 1 : withSpring(1, spring.card);
      return;
    }
    if (reduced) {
      setMounted(false);
      progress.value = 0;
      return;
    }
    progress.value = withTiming(0, { duration: duration.standard, easing: Easing.in(Easing.cubic) }, finished => {
      if (finished) setMounted(false);
    });
  }, [expanded, progress, reduced]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.4, 1], Extrapolate.CLAMP),
    transform: reduced ? [] : [{ translateY: interpolate(progress.value, [0, 1], [-8, 0], Extrapolate.CLAMP) }],
    // height is the measured content height, so the block never has to
    // guess and the scroll position below it does not jump.
    height: height === 0 ? undefined : Math.max(0, height * progress.value),
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: reduced
      ? []
      : [{ rotate: `${interpolate(progress.value, [0, 1], [-90, 0], Extrapolate.CLAMP)}deg` }],
  }));

  return (
    <View>
      <MotionPressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.disclosure}
      >
        <View style={[styles.disclosureIcon, { backgroundColor: colors.surfaceElevated }]}>
          <LucideIcon name={icon} size={16} color={colors.accent} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>{title}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{hint}</Text>
        </View>
        <Animated.View style={chevronStyle}>
          <LucideIcon name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </MotionPressable>
      {mounted ? (
        <Animated.View
          onLayout={event => setHeight(event.nativeEvent.layout.height)}
          style={bodyStyle}
        >
          <View>{children}</View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function formatRecordScope(scope: string): string {
  if (scope === 'day') return 'Лучший день';
  if (scope.startsWith('category:')) {
    return `Категория: ${CATEGORY_LABELS[scope.slice(9) as Category] ?? scope.slice(9)}`;
  }
  return scope;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  loading: { fontFamily: 'Nunito', fontSize: 13 },
  errorTitle: { fontFamily: 'Nunito', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { minHeight: 46, borderRadius: 16, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryLabel: { fontFamily: 'Nunito', fontSize: 14, fontWeight: '800' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingCopy: { flex: 1 },
  headingActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 26, lineHeight: 32, marginTop: 1 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBadge: { position: 'absolute', right: -2, top: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  iconBadgeText: { fontFamily: 'Nunito', fontSize: 10, fontWeight: '900' },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  levelDot: { position: 'absolute', right: -3, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  levelDotText: { fontFamily: 'Nunito', fontSize: 10, lineHeight: 13, fontWeight: '900' },
  playerCard: { borderWidth: 1, padding: 16 },
  playerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  playerIdentity: { flex: 1, gap: 3 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  classLabel: { fontWeight: '800' },
  levelBadge: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12 },
  levelText: { fontSize: 14, lineHeight: 18 },
  xpTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 17, lineHeight: 22, marginTop: 2 },
  card: { borderWidth: 1, padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionCopy: { flex: 1 },
  weeklyEmpty: { paddingVertical: 18, paddingHorizontal: 8 },
  weeklyStats: { flexDirection: 'row', gap: 8 },
  weeklyStat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  weeklyValue: { fontSize: 20, lineHeight: 25 },
  weeklyAxes: { marginTop: 14, gap: 7 },
  weeklyAxis: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weeklyAxisTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  weeklyBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, marginTop: 12 },
  recommendation: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  recommendationIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recommendationCopy: { flex: 1, minWidth: 0 },
  recommendationSide: { alignItems: 'flex-end', gap: 2 },
  dismiss: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  goalTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
  nextCard: { minHeight: 76, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  nextIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, minWidth: 0 },
  nextReward: { alignItems: 'flex-end' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 56 },
  disclosureIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disclosureBody: { marginTop: 2 },
  listCard: { borderWidth: 1, paddingHorizontal: 14 },
  listRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11 },
  listIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  listCopy: { flex: 1, minWidth: 0 },
});

export default HomeScreen;
