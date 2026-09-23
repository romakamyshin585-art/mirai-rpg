/**
 * HomeScreen — Main dashboard with Radar chart + living dashboard.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, RefreshControl, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, useAnimatedStyle, interpolate, Extrapolate, useAnimatedScrollHandler } from 'react-native-reanimated';
import { RadarChart, RadarData } from '../components/RadarChart';
import { PlayerHeader } from '../components/PlayerHeader';
import { LevelProgressRing } from '../components/LevelProgressRing';
import { DailyProgress } from '../components/DailyProgress';
import { NextQuestRow } from '../components/NextQuestRow';
import { AppContext } from '../app_context';
import { useTheme } from '../theme';
import { SPACING } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import { levelProgress } from '../../domain/level';
import { useEntranceAnimation, useHaptics } from '../motion';

export function HomeScreen({ ctx }: { ctx: AppContext }) {
  const { colors } = useTheme();
  const { press } = useHaptics();
  
  const [character, setCharacter] = useState<Awaited<ReturnType<typeof ctx.character.get>> | null>(null);
  const [stats, setStats] = useState<Array<{ category: Category; value: number; xp_total_in_category: number }>>([]);
  const [todayXp, setTodayXp] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [totalActiveQuests, setTotalActiveQuests] = useState(0);
  const [nextQuest, setNextQuest] = useState<{ id: string; title: string; category: Category; difficulty: 1 | 2 | 3; xp_reward: number; time: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [radarData, setRadarData] = useState<RadarData[]>([]);
  const [categoryXp, setCategoryXp] = useState<Record<Category, number>>({ health: 0, knowledge: 0, career: 0, discipline: 0, social: 0 });
  
  const entranceProgress = useEntranceAnimation({ tier: 'standard', delay: 0 });
  const scrollY = useSharedValue(0);

  const loadData = useCallback(async () => {
    try {
      const char = await ctx.character.get(ctx.userId);
      if (!char) return;
      
      setCharacter(char);
      
      const characterStats = await ctx.character.getStats(char.id);
      setStats(characterStats);
      
      // Load real today progress from QuestService
      const todayProgress = await ctx.quest.getTodayProgress(ctx.userId);
      setTodayXp(todayProgress.todayXp);
      setCompletedToday(todayProgress.completedToday);
      setCategoryXp(todayProgress.categoryXp);
      
      const allQuests = await ctx.quest.list(ctx.userId);
      setTotalActiveQuests(allQuests.length);
      
      const firstQuest = allQuests[0];
      if (firstQuest) {
        setNextQuest({
          id: firstQuest.id,
          title: firstQuest.title,
          category: firstQuest.category,
          difficulty: firstQuest.difficulty as 1 | 2 | 3,
          xp_reward: firstQuest.xp_reward,
          time: '00:00',
        });
      }
      
      const radarData = CATEGORIES.map((cat): RadarData => {
        const stat = characterStats.find(s => s.category === cat);
        const maxXpForLevel = Math.max(1, stat?.xp_total_in_category || 1);
        return {
          category: cat,
          value: Math.min(1, (stat?.xp_total_in_category || 0) / Math.max(100, maxXpForLevel)),
          xp: stat?.xp_total_in_category || 0,
          questsCompleted: stat?.value || 0,
          weeklyChange: 0,
        };
      });
      setRadarData(radarData);
      
    } catch (e) {
      console.error('HomeScreen loadData error:', e);
    }
  }, [ctx]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    await press();
  }, [loadData, press]);

  const handleCategoryPress = useCallback((category: Category) => {
    press();
  }, [press]);

  const handleNextQuestPress = useCallback(() => {
    if (nextQuest) {
      press();
    }
  }, [nextQuest, press]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  if (!character) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingSpinner} />
      </View>
    );
  }

  const progress = levelProgress(character.xp);

  return (
    <Animated.ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.accent]}
          progressBackgroundColor={colors.surface}
        />
      }
      onScroll={onScroll}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[styles.entranceWrapper, { opacity: entranceProgress.value }]}>
        
        <Animated.View
          style={[
            styles.section,
            {
              opacity: entranceProgress.value,
              transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [20, 0], Extrapolate.CLAMP) }],
            },
          ]}
        >
          <PlayerHeader
            name={character.name || 'Hero'}
            level={character.level}
            class={character.class}
            xp={character.xp}
            xpForNextLevel={progress.xp_for_next_level}
            xpIntoLevel={progress.xp_into_level}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.section,
            {
              opacity: entranceProgress.value,
              transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [30, 0], Extrapolate.CLAMP) }],
            },
          ]}
        >
          <View style={styles.levelRadarRow}>
            <View style={styles.levelProgressWrapper}>
              <LevelProgressRing xp={character.xp} size={100} strokeWidth={8} />
            </View>
            <View style={styles.radarWrapper}>
              <RadarChart
                data={radarData}
                animated
                interactive
                onCategoryPress={handleCategoryPress}
              />
            </View>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.section,
            {
              opacity: entranceProgress.value,
              transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [40, 0], Extrapolate.CLAMP) }],
            },
          ]}
        >
          <DailyProgress
            todayXp={todayXp}
            completedQuests={completedToday}
            totalQuests={totalActiveQuests}
            streak={calculateStreak(character)}
            categoryXp={categoryXp}
            nextQuest={nextQuest || undefined}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.section,
            {
              opacity: entranceProgress.value,
              transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [50, 0], Extrapolate.CLAMP) }],
            },
          ]}
        >
          <NextQuestRow quest={nextQuest} onPress={handleNextQuestPress} />
        </Animated.View>

      </Animated.View>
    </Animated.ScrollView>
  );
}

function calculateStreak(character: { xp: number }): number {
  return 7;
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0E0F12',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0E0F12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F5A524',
    borderTopColor: 'transparent',
  },
  entranceWrapper: {
    width: '100%',
  },
  section: {
    width: '100%',
  },
  levelRadarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  levelProgressWrapper: {
    width: 100,
    alignItems: 'center',
  },
  radarWrapper: {
    flex: 1,
    maxWidth: 280,
  },
});

export default HomeScreen;