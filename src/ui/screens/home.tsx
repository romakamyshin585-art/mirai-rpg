import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import type { QuestRow } from '../../repos/quest_repo';
import type { CharacterRow, StatRow } from '../../repos/character_repo';
import { CATEGORIES, type Category } from '../../domain/category';
import { levelProgress } from '../../domain/level';
import { BOTTOM_NAV_BASE_HEIGHT, CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { MotionPressable } from '../components/MotionPressable';
import { MotionNumber } from '../components/MotionNumber';
import { MotionProgressBar } from '../components/MotionProgressBar';
import { useScrollHeader } from '../motion';

const DAILY_GOAL = 5;

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
};

export function HomeScreen({ ctx, revision, onOpenQuests }: HomeScreenProps) {
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const char = await ctx.character.get(ctx.userId);
      if (!char) throw new Error('Персонаж не найден');
      const [characterStats, todayProgress, quests, currentStreak] = await Promise.all([
        ctx.character.getStats(char.id),
        ctx.quest.getTodayProgress(ctx.userId),
        ctx.quest.list(ctx.userId),
        ctx.quest.getStreak(ctx.userId),
      ]);
      setCharacter(char);
      setStats(characterStats);
      setTodayXp(todayProgress.todayXp);
      setCompletedToday(todayProgress.completedToday);
      setStreak(currentStreak);
      setActiveQuests(quests);
      setNextQuest(quests[0] ?? null);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void loadData();
  }, [loadData, revision]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loading, { color: colors.textMuted }]}>Собираем твой прогресс…</Text>
      </View>
    );
  }

  if (!character || error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <LucideIcon name="cloud-off" size={38} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Home временно недоступен</Text>
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

  return (
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
            <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Каждый день — это новый квест</Text>
          </View>
          <View style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.surfaceElevated }]}>
            <LucideIcon name="user-round" size={29} color={colors.accent} />
            <View style={[styles.levelDot, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
              <MotionNumber key={`level-${character.level}`} value={character.level} style={[styles.levelDotText, { color: colors.textInverse }]} />
            </View>
          </View>
        </View>
      </Animated.View>

      <View style={[styles.playerCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.xl }]}>
        <View style={styles.playerTop}>
          <View style={styles.playerIdentity}>
            <Text style={[styles.playerName, typography.bodyStrong, { color: colors.text }]}>{character.name || 'Hero'}</Text>
            <View style={styles.classRow}>
              <LucideIcon name={CLASS_ICONS[character.class ?? ''] ?? 'sparkles'} size={15} color={colors.accent} />
              <Text style={[styles.classLabel, typography.caption, { color: colors.accent }]}>{classLabel}</Text>
            </View>
          </View>
          <View style={[styles.levelBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.levelText, typography.numeric, { color: colors.accent }]}>LV {character.level}</Text>
          </View>
        </View>
        <View style={styles.xpLabels}>
          <Text style={[styles.xpLabel, typography.caption, { color: colors.textMuted }]}>{progress.xp_into_level} / {progress.xp_for_next_level} XP</Text>
          <Text style={[styles.xpLabel, typography.caption, { color: colors.textMuted }]}>{progress.level_progress_pct}%</Text>
        </View>
        <MotionProgressBar
          value={progress.level_progress_pct / 100}
          trackColor={colors.surfaceFloating}
          fillColor={colors.accent}
          height={7}
          style={styles.xpTrack}
          accessibilityLabel="Прогресс уровня"
        />
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.metricHeading}>
            <View style={[styles.metricIcon, { backgroundColor: colors.accentSoft }]}>
              <LucideIcon name="zap" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>Сегодня</Text>
          </View>
           <MotionNumber key={`today-xp-${todayXp}`} value={todayXp} style={[styles.metricValue, typography.numericDisplay, { color: colors.accent }]} />
          <Text style={[styles.metricHint, typography.caption, { color: colors.textMuted }]}>XP заработано</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.metricHeading}>
            <View style={[styles.metricIcon, { backgroundColor: `${colors.warning}20` }]}>
              <LucideIcon name="flame" size={18} color={colors.warning} />
            </View>
            <Text style={[styles.metricLabel, typography.caption, { color: colors.textMuted }]}>Серия</Text>
          </View>
           <MotionNumber key={`streak-${streak}`} value={streak} style={[styles.metricValue, typography.numericDisplay, { color: colors.text }]} />
          <Text style={[styles.metricHint, typography.caption, { color: colors.textMuted }]}>дней подряд</Text>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Активность</Text>
        <Text style={[styles.sectionMeta, typography.caption, { color: colors.textMuted }]}>{completedToday} из {DAILY_GOAL} квестов</Text>
      </View>
      <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        <View style={styles.activityGrid}>
          {CATEGORIES.map(category => {
            const stat = stats.find(item => item.category === category);
            const categoryColor = colors[`cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors];
            return (
              <View key={category} style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: `${categoryColor}20` }]}>
                  <LucideIcon name={CATEGORY_ICONS[category]} size={18} color={categoryColor} />
                </View>
                <View style={styles.activityCopy}>
                  <Text style={[styles.activityLabel, typography.caption, { color: colors.textSecondary }]}>{CATEGORY_LABELS[category]}</Text>
                  <Text style={[styles.activityValue, typography.numeric, { color: colors.text }]}>{stat?.value ?? 0}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <MotionPressable
        accessibilityRole="button"
        onPress={onOpenQuests}
        style={[styles.goalCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
      >
        <View style={styles.goalIcon}>
          <LucideIcon name="target" size={24} color={colors.accent} />
        </View>
        <View style={styles.goalCopy}>
          <View style={styles.goalHeading}>
            <Text style={[styles.goalTitle, typography.bodyStrong, { color: colors.text }]}>Цель на сегодня</Text>
            <Text style={[styles.goalCount, typography.numeric, { color: colors.accent }]}>{completedToday}/{DAILY_GOAL}</Text>
          </View>
           <MotionProgressBar
             value={goalProgress}
             trackColor={colors.surfaceFloating}
             fillColor={colors.accent}
             height={6}
             style={styles.goalTrack}
             accessibilityLabel="Прогресс дневной цели"
           />
          <Text style={[styles.goalHint, typography.caption, { color: colors.textMuted }]}>Заверши ещё {Math.max(0, DAILY_GOAL - completedToday)} квестов</Text>
        </View>
        <LucideIcon name="chevron-right" size={19} color={colors.textMuted} />
      </MotionPressable>

      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Следующий квест</Text>
        <Text style={[styles.sectionMeta, typography.caption, { color: colors.textMuted }]}>{activeQuests.length} доступно</Text>
      </View>
      {nextQuest ? (
        <MotionPressable
          accessibilityRole="button"
          onPress={onOpenQuests}
          style={[styles.nextCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
        >
          <View style={[styles.nextIcon, { backgroundColor: `${colors.catCareer}20` }]}>
            <LucideIcon name="scroll-text" size={23} color={colors.catCareer} />
          </View>
          <View style={styles.nextCopy}>
            <Text numberOfLines={1} style={[styles.nextTitle, typography.bodyStrong, { color: colors.text }]}>{nextQuest.title}</Text>
            <Text style={[styles.nextMeta, typography.caption, { color: colors.textMuted }]}>{CATEGORY_LABELS[nextQuest.category]} · сложность {nextQuest.difficulty}/3</Text>
          </View>
          <View style={styles.nextReward}>
            <Text style={[styles.nextXp, typography.numeric, { color: colors.accent }]}>+{nextQuest.xp_reward}</Text>
            <Text style={[styles.nextXpLabel, typography.caption, { color: colors.textMuted }]}>XP</Text>
          </View>
        </MotionPressable>
      ) : (
        <MotionPressable
          accessibilityRole="button"
          onPress={onOpenQuests}
          style={[styles.nextCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
        >
          <View style={styles.nextCopy}>
            <Text style={[styles.nextTitle, typography.bodyStrong, { color: colors.text }]}>Добавь первый квест</Text>
            <Text style={[styles.nextMeta, typography.caption, { color: colors.textMuted }]}>Открой Quests и начни путь</Text>
          </View>
          <LucideIcon name="plus" size={22} color={colors.accent} />
        </MotionPressable>
      )}
    </Animated.ScrollView>
  );
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
  retry: { minHeight: 46, borderRadius: 14, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryLabel: { fontFamily: 'Nunito', fontSize: 14, fontWeight: '800' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingCopy: { flex: 1 },
  greeting: { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 28, lineHeight: 34, marginTop: 1 },
  subtitle: { marginTop: 3 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  levelDot: { position: 'absolute', right: -3, bottom: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  levelDotText: { fontFamily: 'Nunito', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  playerCard: { borderWidth: 1, padding: 16 },
  playerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerIdentity: { flex: 1 },
  playerName: { fontSize: 17, lineHeight: 22 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  classLabel: { fontWeight: '800' },
  levelBadge: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12 },
  levelText: { fontSize: 14, lineHeight: 18 },
  xpLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
  xpLabel: { fontVariant: ['tabular-nums'] },
  xpTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, minHeight: 142, borderWidth: 1, borderRadius: 18, padding: 14 },
  metricHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontWeight: '700' },
  metricValue: { fontSize: 34, lineHeight: 40, marginTop: 11 },
  metricHint: { marginTop: 1 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
  sectionTitle: { fontSize: 16, lineHeight: 21 },
  sectionMeta: {},
  activityCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  activityGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  activityItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 3 },
  activityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1 },
  activityLabel: {},
  activityValue: { fontSize: 15, lineHeight: 19, marginTop: 1 },
  goalCard: { minHeight: 96, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(245,165,36,0.12)', alignItems: 'center', justifyContent: 'center' },
  goalCopy: { flex: 1 },
  goalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalTitle: { fontSize: 15, lineHeight: 20 },
  goalCount: { fontSize: 14, lineHeight: 18 },
  goalTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 9 },
  goalFill: { height: '100%', borderRadius: 3 },
  goalHint: { marginTop: 5 },
  nextCard: { minHeight: 78, borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, minWidth: 0 },
  nextTitle: { fontSize: 15, lineHeight: 20 },
  nextMeta: { marginTop: 3 },
  nextReward: { alignItems: 'flex-end' },
  nextXp: { fontSize: 16, lineHeight: 20 },
  nextXpLabel: { fontSize: 10, lineHeight: 13 },
});
