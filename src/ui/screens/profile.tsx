import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import type { CharacterRow, StatRow } from '../../repos/character_repo';
import type { RecentActivityItem } from '../../services/quest_service';
import { CATEGORIES, type Category } from '../../domain/category';
import { levelProgress } from '../../domain/level';
import { BOTTOM_NAV_BASE_HEIGHT, CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { RadarChart, type RadarData } from '../components/RadarChart';

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

type ProfileScreenProps = {
  ctx: AppContext;
  revision: number;
  onOpenAchievements: () => void;
};

export function ProfileScreen({ ctx, revision, onOpenAchievements }: ProfileScreenProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [personalBests, setPersonalBests] = useState<Array<{ scope: string; value: number; achieved_at: string }>>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [unlocked, setUnlocked] = useState(0);
  const [totalAchievements, setTotalAchievements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const char = await ctx.character.get(ctx.userId);
      if (!char) throw new Error('Персонаж не найден');
      const [characterStats, bests, activity, catalog, unlockedRows] = await Promise.all([
        ctx.character.getStats(char.id),
        ctx.achievement.listPersonalBests(ctx.userId),
        ctx.quest.getRecentActivity(ctx.userId, 8),
        ctx.achievement.listCatalog(),
        ctx.achievement.listUnlocked(ctx.userId),
      ]);
      setCharacter(char);
      setStats(characterStats);
      setPersonalBests(bests);
      setRecentActivity(activity);
      setUnlocked(unlockedRows.length);
      setTotalAchievements(catalog.length);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loading, { color: colors.textMuted }]}>Загружаем профиль…</Text>
      </View>
    );
  }

  if (!character || error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <LucideIcon name="user-round-x" size={40} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Профиль не загрузился</Text>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>{error ?? 'Попробуй ещё раз'}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void reload()}
          style={({ pressed }) => [styles.retry, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  const progress = levelProgress(character.xp);
  const maxCategoryXp = Math.max(100, ...stats.map(stat => stat.xp_total_in_category));
  const radarData: RadarData[] = CATEGORIES.map(category => {
    const stat = stats.find(item => item.category === category);
    return {
      category,
      value: Math.min(1, (stat?.xp_total_in_category ?? 0) / maxCategoryXp),
      xp: stat?.xp_total_in_category ?? 0,
      questsCompleted: stat?.value ?? 0,
      weeklyChange: 0,
    };
  });
  const achievementProgress = totalAchievements > 0 ? Math.round((unlocked / totalAchievements) * 100) : 0;

  return (
    <ScrollView
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
      <View style={styles.heading}>
        <View>
          <Text style={[styles.title, typography.title, { color: colors.text }]}>Профиль</Text>
          <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Твоя история, способности и прогресс</Text>
        </View>
        <View style={[styles.status, { backgroundColor: colors.successSoft }]}>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          <Text style={[typography.caption, { color: colors.success, fontWeight: '800' }]}>В пути</Text>
        </View>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.xl }]}>
        <View style={[styles.heroGlow, { backgroundColor: `${colors.catDiscipline}20` }]} />
        <View style={styles.heroTop}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.surfaceElevated }]}>
              <LucideIcon name="user-round" size={44} color={colors.accent} />
            </View>
            <View style={[styles.levelBubble, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
              <Text style={[styles.levelBubbleText, { color: colors.textInverse }]}>{character.level}</Text>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroName, typography.title, { color: colors.text }]}>{character.name || 'Hero'}</Text>
            <View style={styles.classRow}>
              <LucideIcon name={CLASS_ICONS[character.class ?? ''] ?? 'sparkles'} size={16} color={colors.accent} />
              <Text style={[styles.classLabel, typography.bodyStrong, { color: colors.accent }]}>
                {character.class ? CLASS_LABELS[character.class] ?? character.class : 'Исследователь'}
              </Text>
            </View>
            <Text style={[styles.heroMeta, typography.caption, { color: colors.textMuted }]}>{character.xp} XP всего</Text>
          </View>
        </View>
        <View style={[styles.heroDivider, { backgroundColor: colors.borderSubtle }]} />
        <View style={styles.xpLabels}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{progress.xp_into_level} / {progress.xp_for_next_level} XP</Text>
          <Text style={[typography.caption, { color: colors.accent, fontWeight: '800' }]}>{progress.level_progress_pct}% до Lv.{character.level + 1}</Text>
        </View>
        <View style={[styles.xpTrack, { backgroundColor: colors.surfaceFloating }]}>
          <View style={[styles.xpFill, { width: `${progress.level_progress_pct}%`, backgroundColor: colors.accent }]} />
        </View>
      </View>

      <View style={[styles.radarCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Характеристики</Text>
            <Text style={[styles.sectionHint, typography.caption, { color: colors.textMuted }]}>Баланс пяти областей развития</Text>
          </View>
          <LucideIcon name="radar" size={22} color={colors.catDiscipline} />
        </View>
        <RadarChart data={radarData} interactive />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Категории</Text>
          <Text style={[styles.sectionHint, typography.caption, { color: colors.textMuted }]}>Всего выполнено и заработано</Text>
        </View>
      </View>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map(category => {
          const stat = stats.find(item => item.category === category);
          const categoryColor = colors[`cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors];
          return (
            <View
              key={category}
              style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}
            >
              <View style={[styles.categoryIcon, { backgroundColor: `${categoryColor}20` }]}>
                <LucideIcon name={CATEGORY_ICONS[category]} size={20} color={categoryColor} />
              </View>
              <Text style={[styles.categoryName, typography.caption, { color: colors.textSecondary }]}>{CATEGORY_LABELS[category]}</Text>
              <Text style={[styles.categoryXp, typography.numeric, { color: categoryColor }]}>{stat?.xp_total_in_category ?? 0}</Text>
              <Text style={[styles.categoryMeta, typography.caption, { color: colors.textMuted }]}>{stat?.value ?? 0} квестов</Text>
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenAchievements}
        style={({ pressed }) => [styles.achievementCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.achievementIcon, { backgroundColor: colors.accentSoft }]}>
          <LucideIcon name="trophy" size={25} color={colors.accent} />
        </View>
        <View style={styles.achievementCopy}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>Достижения</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{unlocked} из {totalAchievements} открыто</Text>
          <View style={[styles.achievementTrack, { backgroundColor: colors.surfaceFloating }]}>
            <View style={[styles.achievementFill, { width: `${achievementProgress}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>
        <View style={styles.achievementValue}>
          <Text style={[typography.numeric, { color: colors.accent }]}>{achievementProgress}%</Text>
          <LucideIcon name="chevron-right" size={18} color={colors.textMuted} />
        </View>
      </Pressable>

      {personalBests.length > 0 ? (
        <View>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Рекорды</Text>
              <Text style={[styles.sectionHint, typography.caption, { color: colors.textMuted }]}>Лучшие результаты</Text>
            </View>
          </View>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {personalBests.map((record, index) => (
              <View key={record.scope} style={[styles.recordRow, index > 0 && { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.recordIcon, { backgroundColor: colors.accentSoft }]}>
                  <LucideIcon name={record.scope === 'day' ? 'sun' : 'trophy'} size={18} color={colors.accent} />
                </View>
                <View style={styles.recordCopy}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatRecordScope(record.scope)}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {new Date(record.achieved_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <Text style={[typography.numeric, { color: colors.accent }]}>{record.value} XP</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {recentActivity.length > 0 ? (
        <View>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, typography.bodyStrong, { color: colors.text }]}>Недавняя активность</Text>
              <Text style={[styles.sectionHint, typography.caption, { color: colors.textMuted }]}>Последние завершения</Text>
            </View>
          </View>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {recentActivity.map((activity, index) => (
              <View key={activity.id} style={[styles.activityRow, index > 0 && { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.activityIcon, { backgroundColor: colors.successSoft }]}>
                  <LucideIcon name="check" size={17} color={colors.success} />
                </View>
                <View style={styles.activityCopy}>
                  <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>{activity.title}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{activity.subtitle}</Text>
                </View>
                {activity.xp ? <Text style={[typography.numericSmall, { color: colors.accent }]}>+{activity.xp}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function formatRecordScope(scope: string): string {
  if (scope === 'day') return 'Лучший день';
  if (scope.startsWith('category:')) return `Категория: ${CATEGORY_LABELS[scope.slice(9) as Category] ?? scope.slice(9)}`;
  return scope;
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
  title: { fontSize: 28, lineHeight: 34 },
  subtitle: { marginTop: 2 },
  status: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  hero: { borderWidth: 1, padding: 16, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -65, top: -85 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  avatarWrap: { width: 98, height: 98, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  levelBubble: { position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  levelBubbleText: { fontFamily: 'Nunito', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  heroCopy: { flex: 1 },
  heroName: { fontSize: 24, lineHeight: 30 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  classLabel: { fontSize: 14, lineHeight: 20 },
  heroMeta: { marginTop: 7 },
  heroDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  xpLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  xpTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },
  radarCard: { borderWidth: 1, borderRadius: 18, padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { fontSize: 16, lineHeight: 21 },
  sectionHint: { marginTop: 1 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { width: '48%', minHeight: 136, borderWidth: 1, padding: 13 },
  categoryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  categoryName: { fontWeight: '700' },
  categoryXp: { fontSize: 20, lineHeight: 24, marginTop: 3 },
  categoryMeta: { marginTop: 1 },
  achievementCard: { minHeight: 94, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  achievementIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  achievementCopy: { flex: 1 },
  achievementTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 7 },
  achievementFill: { height: '100%', borderRadius: 3 },
  achievementValue: { alignItems: 'flex-end', gap: 3 },
  listCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
  recordRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11 },
  recordIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recordCopy: { flex: 1 },
  activityRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11 },
  activityIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1, minWidth: 0 },
});

export default ProfileScreen;
