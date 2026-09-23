/**
 * Achievements screen — Trophy grid with unlock animations.
 * 
 * Features:
 * - Masonry-style trophy grid
 * - Locked: silhouette with subtle shimmer
 * - Unlocked: reveal animation with glow + haptic
 * - Rarity-based visual treatment
 */

import { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle, interpolate, Easing } from 'react-native-reanimated';
import { H1, H3, Muted } from '../components';
import { AppContext } from '../app_context';
import { useTheme } from '../theme';
import { SPACING } from '../theme';
import { RARITY_COLORS } from '../theme';
import { TYPOGRAPHY_STYLESHEET } from '../theme';
import { usePressAnimation, useEntranceAnimation, useHaptics, HAPTIC_EVENTS } from '../motion';

interface AchievementItemProps {
  item: { id: string; code: string; name: string; description: string; rarity: string; icon: string; isUnlocked: boolean };
  rarityColor: string;
  onPress?: () => void;
  index: number;
}

function AchievementItem({ item, rarityColor, onPress, index }: AchievementItemProps) {
  const { isUnlocked } = item;
  const { pressIn, pressOut } = usePressAnimation();
  const { trigger } = useHaptics();
  const entranceProgress = useEntranceAnimation({ tier: 'standard', delay: index * 30 });
  const unlockAnim = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => {
    return {
      opacity: isUnlocked ? entranceProgress.value : interpolate(entranceProgress.value, [0, 1], [0, 0.4]),
      transform: [{ scale: interpolate(entranceProgress.value, [0, 1], [0.9, 1]) }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const rotateValue = isUnlocked 
      ? `${interpolate(unlockAnim.value, [0, 1], [0, 360])}deg`
      : '0deg';
    return {
      opacity: isUnlocked ? entranceProgress.value : interpolate(entranceProgress.value, [0, 1], [0, 0.3]),
      transform: [
        { scale: isUnlocked ? withSpring(1, { damping: 15, stiffness: 200 }) : interpolate(entranceProgress.value, [0, 1], [0.5, 1]) },
        { rotate: rotateValue },
      ],
    };
  });

  const handlePress = () => {
    if (!isUnlocked) return;
    trigger(HAPTIC_EVENTS.achievementUnlock);
    unlockAnim.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }, () => {
      unlockAnim.value = withTiming(0, { duration: 300 });
    });
    onPress?.();
  };

  const cardBgColor = isUnlocked ? '#1A1C22' : '#23262E';
  const borderColor = isUnlocked ? rarityColor : '#1E2128';
  const textColor = isUnlocked ? '#E6E8EC' : '#8A8E99';

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={1}
      style={[styles.card, { backgroundColor: cardBgColor, borderColor: borderColor }, cardStyle]}
    >
      <View style={styles.iconWrapper}>
        <Animated.View style={iconStyle}>
          <Text style={{ fontSize: 36 }}>{isUnlocked ? item.icon : '🔒'}</Text>
          {isUnlocked && (
            <Animated.View
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: 16,
                backgroundColor: rarityColor,
                opacity: interpolate(unlockAnim.value, [0, 1], [0, 0.3]),
              }}
            />
          )}
        </Animated.View>
        {isUnlocked && (
          <Animated.View
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: '#F5A524',
              borderWidth: 2,
              borderColor: '#0E0F12',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: interpolate(unlockAnim.value, [0, 1], [0, 1]),
              transform: [{ scale: interpolate(unlockAnim.value, [0, 1], [0, 1]) }],
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#0E0F12' }}>✓</Text>
          </Animated.View>
        )}
      </View>
      <View style={styles.content}>
        <H3 style={{ color: textColor }}>{item.name}</H3>
        <Muted>{item.description}</Muted>
        <View style={styles.rarityBadge}>
          <Text style={{ ...TYPOGRAPHY_STYLESHEET.caption, color: rarityColor, fontWeight: '600' }}>{item.rarity.toUpperCase()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function AchievementsScreen({ ctx }: { ctx: AppContext }) {
  const { colors } = useTheme();
  
  const [catalog, setCatalog] = useState<Array<{ id: string; code: string; name: string; description: string; rarity: string; icon: string }>>([]);
  const [unlocked, setUnlocked] = useState<Array<{ code: string; name: string; description: string; rarity: string; icon: string; unlockedAt: string }>>([]);

  const reload = useCallback(async () => {
    setCatalog(await ctx.achievement.listCatalog() as any);
    setUnlocked(await ctx.achievement.listUnlocked(ctx.userId) as any);
  }, [ctx]);

  useEffect(() => { reload(); }, [reload]);

  const unlockedIds = new Set(unlocked.map((u) => u.name));
  const lockedRows = catalog.filter((c) => !unlockedIds.has(c.name));
  const allItems = [
    ...unlocked.map(u => ({ ...u, id: u.code, isUnlocked: true as const })),
    ...lockedRows.map(c => ({ ...c, isUnlocked: false as const }))
  ];

  const handleItemPress = (item: { id: string; code: string; name: string; description: string; rarity: string; icon: string; isUnlocked: boolean }) => {
    if (item.isUnlocked) {
      // Show detail for unlocked
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
      <H1>Achievements</H1>
      <Muted>Unlocked {unlocked.length} of {catalog.length}</Muted>

      <View style={styles.grid}>
        {allItems.map((item, index) => (
          <AchievementItem
            key={item.id}
            item={item}
            rarityColor={RARITY_COLORS[item.rarity] ?? colors.text}
            onPress={() => handleItemPress(item)}
            index={index}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: '#1A1C22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E2128',
    padding: 12,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  iconWrapper: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#23262E',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  content: {
    gap: 4,
  },
  rarityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

export default AchievementsScreen;