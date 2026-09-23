/**
 * Profile screen — RPG Character Sheet (Primary)
 * 
 * Priority order:
 * 1. Character (avatar, name, class)
 * 2. Level (animated ring)
 * 3. Class
 * 4. XP
 * 5. Radar (5-axis interactive)
 * 6. Category stats
 * 7. Progression (personal bests)
 * 8. Recent activity
 * 9. Achievements (summary + link)
 * 
 * Settings: Secondary action (separate screen/modal)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import {
  Card,
  H1,
  H2,
  Muted,
  Text,
  Row,
  Column,
  LucideIcon,
} from '../components';
import { AppContext } from '../app_context';
import { useTheme } from '../theme';
import { SPACING, CATEGORY_LABELS, CATEGORY_COLORS, TYPOGRAPHY_STYLESHEET } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import { levelProgress } from '../../domain/level';
import type { CharacterRow, StatRow } from '../../repos/character_repo';
import { RadarChart, type RadarData } from '../components/RadarChart';
import { LevelProgressRing } from '../components/LevelProgressRing';

const CLASS_LABEL: Record<string, string> = {
  warrior: '⚔️ Воин',
  scholar: '📚 Учёный',
  builder: '🔨 Строитель',
  monk: '🧘 Монах',
  leader: '👑 Лидер',
};

const CLASS_ICON: Record<string, string> = {
  warrior: 'sword',
  scholar: 'book-open',
  builder: 'hammer',
  monk: 'circle',
  leader: 'crown',
};

const RECENT_ACTION_LIMIT = 5;

interface ProfileScreenProps {
  ctx: AppContext;
}

interface ActivityItem {
  id: string;
  type: 'quest_complete' | 'achievement_unlock' | 'level_up' | 'xp_gain';
  title: string;
  subtitle: string;
  timestamp: string;
  category?: Category;
  xp?: number;
}

export function ProfileScreen({ ctx }: ProfileScreenProps) {
  const { colors, motion } = useTheme();
  const { section, body, bodyStrong, caption, numeric, numericDisplay, numericSmall } = TYPOGRAPHY_STYLESHEET;
  
  const [char, setChar] = useState<CharacterRow | null>(null);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [pbs, setPbs] = useState<Array<{ scope: string; value: number; achieved_at: string }>>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [achievementsSummary, setAchievementsSummary] = useState<{ unlocked: number; total: number }>({ unlocked: 0, total: 0 });

  const entranceProgress = useSharedValue(0);

  const reload = useCallback(async () => {
    const c = await ctx.character.get(ctx.userId);
    setChar(c);
    if (c) {
      const [statsData, pbsData, activityData, achievementsData] = await Promise.all([
        ctx.character.getStats(c.id),
        ctx.achievement.listPersonalBests(ctx.userId),
        ctx.quest.getRecentActivity(ctx.userId, RECENT_ACTION_LIMIT),
        ctx.achievement.listCatalog(),
      ]);
      setStats(statsData);
      setPbs(pbsData);
      setRecentActivity(activityData as ActivityItem[]);
      const unlocked = await ctx.achievement.listUnlocked(ctx.userId);
      setAchievementsSummary({ unlocked: unlocked.length, total: achievementsData.length });
    }
  }, [ctx]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    entranceProgress.value = withSpring(1, { damping: 22, stiffness: 180 });
  }, []);

  if (!char) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: SPACING.lg }}>
        <H1>Character</H1>
        <Muted>Loading…</Muted>
      </View>
    );
  }

  const progress = levelProgress(char.xp);
  const level = char.level;
  const xpPercent = progress.level_progress_pct / 100;

  const radarData = useMemo((): RadarData[] => {
    return CATEGORIES.map((cat) => {
      const stat = stats.find((s) => s.category === cat);
      const xp = stat?.xp_total_in_category ?? 0;
      const completed = stat?.value ?? 0;
      return {
        category: cat,
        value: Math.min(xp / 1000, 1),
        xp,
        questsCompleted: completed,
        weeklyChange: 0,
      };
    });
  }, [stats]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [20, 0], Extrapolate.CLAMP) }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.xl }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* ===== 1. CHARACTER HEADER ===== */}
        <Card elevated>
          <View style={styles.headerSection}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>👤</Text>
                </View>
                <LevelProgressRing xp={char.xp} size={96} strokeWidth={4} showLevel={true} />
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>Lv.{level}</Text>
              </View>
            </View>

            <View style={styles.characterInfo}>
              <H1 style={{ color: colors.text }}>{char.name ?? 'Hero'}</H1>
              {char.class ? (
                <View style={styles.classRow}>
                  <LucideIcon name={CLASS_ICON[char.class] ?? 'user'} size={16} color={colors.accent} />
                  <Text style={{ ...bodyStrong, color: colors.accent }}>{CLASS_LABEL[char.class] ?? char.class}</Text>
                </View>
              ) : (
                <Muted>Класс ещё не определён</Muted>
              )}
              <View style={styles.xpSummary}>
                <Text style={{ ...numeric, color: colors.accent }}>{char.xp}</Text>
                <Text style={{ ...caption, color: colors.textMuted }}> Total XP</Text>
              </View>
            </View>
          </View>

          {/* XP Progress Bar */}
          <View style={styles.xpProgressContainer}>
            <Row gap={SPACING.sm} style={styles.xpLabels}>
              <Text style={{ ...caption, color: colors.textMuted }}>XP до следующего уровня</Text>
              <Text style={{ ...caption, color: colors.accent }}>{progress.level_progress_pct}%</Text>
            </Row>
            <View style={styles.xpBarTrack}>
              <Animated.View
                style={[
                  styles.xpBarFill,
                  {
                    width: `${xpPercent * 100}%`,
                  },
                ]}
              />
            </View>
            <Row gap={SPACING.sm} style={styles.xpLabels}>
              <Text style={{ ...caption, color: colors.textMuted }}>{progress.xp_into_level} / {progress.xp_for_next_level} XP</Text>
              <Text style={{ ...caption, color: colors.textMuted }}>Lv.{level + 1}</Text>
            </Row>
          </View>
        </Card>

        {/* ===== 2. RADAR CHART (5-axis interactive) ===== */}
        <Card elevated>
          <Row style={styles.sectionHeader}>
            <H2>Профиль способностей</H2>
            <TouchableOpacity style={styles.sectionAction} onPress={() => {/* Navigate to detailed radar */}}>
              <LucideIcon name="maximize" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Row>
          <RadarChart
            data={radarData}
            animated={true}
            interactive={true}
            onCategoryPress={(_cat) => {
              // Haptic feedback handled in RadarChart
            }}
          />
        </Card>

        {/* ===== 3. CATEGORY STATS ===== */}
        <Card elevated>
          <H2 style={{ marginBottom: SPACING.md }}>Категории</H2>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const stat = stats.find((s) => s.category === cat);
              const xp = stat?.xp_total_in_category ?? 0;
              const completed = stat?.value ?? 0;
              const catColor = CATEGORY_COLORS[cat];
              return (
                <TouchableOpacity
                  key={cat}
                  style={styles.categoryCard}
                  activeOpacity={0.8}
                  onPress={() => {/* Navigate to category detail */}}
                >
                  <View style={styles.categoryHeader}>
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: catColor,
                      }}
                    />
                    <Text style={{ ...bodyStrong, color: colors.text }}>{CATEGORY_LABELS[cat]}</Text>
                  </View>
                  <View style={styles.categoryStats}>
                    <Column gap={2} style={styles.statColumn}>
                      <Text style={{ ...numeric, color: catColor }}>{xp}</Text>
                      <Text style={{ ...caption, color: colors.textMuted }}>XP</Text>
                    </Column>
                    <View style={styles.divider} />
                    <Column gap={2} style={styles.statColumn}>
                      <Text style={{ ...numeric, color: colors.text }}>{completed}</Text>
                      <Text style={{ ...caption, color: colors.textMuted }}>Квестов</Text>
                    </Column>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* ===== 4. PROGRESSION (Personal Bests) ===== */}
        {pbs.length > 0 && (
          <Card elevated>
            <Row style={styles.sectionHeader}>
              <H2>Рекорды</H2>
            </Row>
            <View style={styles.pbList}>
              {pbs.map((p, index) => (
                <View key={p.scope} style={[styles.pbItem, index > 0 && styles.pbDivider]}>
                  <View style={styles.pbInfo}>
                    <Text style={{ ...section, color: colors.accent }}>{p.scope}</Text>
                    <Text style={{ ...caption, color: colors.textMuted }}>
                      {new Date(p.achieved_at).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={{ ...numeric, color: colors.text }}>{p.value} XP</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* ===== 5. RECENT ACTIVITY ===== */}
        {recentActivity.length > 0 && (
          <Card elevated>
            <Row style={styles.sectionHeader}>
              <H2>Недавняя активность</H2>
            </Row>
            <View style={styles.activityList}>
              {recentActivity.map((activity, index) => (
                <View key={activity.id} style={[styles.activityItem, index > 0 && styles.activityDivider]}>
                  <View style={styles.activityIcon}>
                    <LucideIcon
                      name={
                        activity.type === 'quest_complete' ? 'check-circle' :
                        activity.type === 'achievement_unlock' ? 'trophy' :
                        activity.type === 'level_up' ? 'arrow-up-circle' : 'zap'
                      }
                      size={20}
                      color={
                        activity.type === 'quest_complete' ? colors.success :
                        activity.type === 'achievement_unlock' ? colors.accent :
                        activity.type === 'level_up' ? colors.warning : colors.catKnowledge
                      }
                    />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={{ ...body, color: colors.text }}>{activity.title}</Text>
                    <Text style={{ ...caption, color: colors.textMuted }}>{activity.subtitle}</Text>
                  </View>
                  <View style={styles.activityMeta}>
                    {activity.xp && (
                      <Text style={{ ...numericSmall, color: colors.accent }}>+{activity.xp} XP</Text>
                    )}
                    <Text style={{ ...caption, color: colors.textMuted }}>
                      {new Date(activity.timestamp).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* ===== 6. ACHIEVEMENTS SUMMARY ===== */}
        <Card elevated>
          <Row style={styles.sectionHeader}>
            <H2>Достижения</H2>
            <TouchableOpacity
              style={styles.sectionAction}
              onPress={() => {
                // Navigate to Achievements screen
              }}
            >
              <LucideIcon name="chevron-right" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Row>
          <View style={styles.achievementsSummary}>
            <View style={styles.achievementStat}>
              <Text style={{ ...numericDisplay, color: colors.accent }}>{achievementsSummary.unlocked}</Text>
              <Text style={{ ...caption, color: colors.textMuted }}>Разблокировано</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.achievementStat}>
              <Text style={{ ...numericDisplay, color: colors.text }}>{achievementsSummary.total}</Text>
              <Text style={{ ...caption, color: colors.textMuted }}>Всего</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.achievementStat}>
              <Text style={{ ...numericDisplay, color: colors.textSecondary }}>
                {achievementsSummary.total > 0
                  ? Math.round((achievementsSummary.unlocked / achievementsSummary.total) * 100)
                  : 0}%
              </Text>
              <Text style={{ ...caption, color: colors.textMuted }}>Прогресс</Text>
            </View>
          </View>
        </Card>

        {/* ===== 7. SETTINGS (Secondary Action) ===== */}
        <Card elevated style={styles.settingsCard}>
          <Row style={styles.settingsRow} gap={SPACING.md}>
            <View style={styles.settingsIcon}>
              <LucideIcon name="settings" size={24} color={colors.textSecondary} />
            </View>
            <Column gap={2} style={styles.settingsInfo}>
              <Text style={{ ...bodyStrong, color: colors.text }}>Настройки</Text>
              <Text style={{ ...caption, color: colors.textMuted }}>Уведомления, тема, данные, аккаунт</Text>
            </Column>
            <LucideIcon name="chevron-right" size={20} color={colors.textMuted} />
          </Row>
        </Card>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.lg,
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#23262E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E2128',
  },
  avatarText: {
    fontSize: 32,
  },
  levelBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#F5A524',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: '#0E0F12',
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0E0F12',
  },
  characterInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  xpSummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  xpProgressContainer: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: '#1E2128',
  },
  xpLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpBarTrack: {
    height: 8,
    backgroundColor: '#1E2128',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: SPACING.xs,
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#F5A524',
    borderRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionAction: {
    padding: SPACING.xs,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: '48%',
    backgroundColor: '#23262E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E2128',
    padding: SPACING.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  categoryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statColumn: {
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: '#1E2128',
  },
  pbList: {
    gap: 0,
  },
  pbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  pbDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1E2128',
  },
  pbInfo: {
    gap: 2,
  },
  activityList: {
    gap: 0,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  activityDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1E2128',
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#23262E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
    gap: 2,
  },
  activityMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  achievementsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  achievementStat: {
    alignItems: 'center',
    gap: 4,
  },
  settingsCard: {
    backgroundColor: '#23262E',
    borderColor: '#1E2128',
  },
  settingsRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1C22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsInfo: {
    flex: 1,
  },
});

export default ProfileScreen;