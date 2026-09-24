/**
 * PlayerHeader — Compact premium header with character info.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { SPACING } from '../theme';
import { levelProgress } from '../../domain/level';
import { LucideIcon } from '../components';

interface PlayerHeaderProps {
  name: string;
  level: number;
  class: string | null;
  xp: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: 'Воин',
  scholar: 'Учёный',
  builder: 'Строитель',
  monk: 'Монах',
  leader: 'Лидер',
};

const CLASS_ICON: Record<string, string> = {
  warrior: 'sword',
  scholar: 'book-open',
  builder: 'hammer',
  monk: 'circle',
  leader: 'crown',
};

export function PlayerHeader({ name, level, class: charClass, xp, xpForNextLevel, xpIntoLevel }: PlayerHeaderProps) {
  const { colors, motion } = useTheme();
  const { numeric, caption, title, secondary } = useTheme().typographyStylesheet;
  const entranceProgress = useSharedValue(0);

  React.useEffect(() => {
    entranceProgress.value = withSpring(1, { damping: 22, stiffness: 180 });
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(entranceProgress.value, { duration: motion.durations.normal }),
    transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [20, 0], Extrapolate.CLAMP) }],
  }));

  const progress = levelProgress(xp);
  const xpPercent = progress.level_progress_pct / 100;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.headerRow}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <LucideIcon name="user" size={24} color={colors.accent} />
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Lv.{level}</Text>
          </View>
        </View>
        
        <View style={styles.info}>
          <Text style={{ ...title, color: colors.text }}>{name || 'Hero'}</Text>
          {charClass && (
            <View style={styles.classRow}>
              <LucideIcon name={CLASS_ICON[charClass] ?? 'user'} size={16} color={colors.accent} />
              <Text style={{ ...secondary, color: colors.accent }}>{CLASS_LABEL[charClass] || charClass}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.xpRow}>
        <View style={styles.xpInfo}>
          <Text style={{ ...numeric, color: colors.accent }}>{xpIntoLevel}</Text>
          <Text style={{ ...caption, color: colors.textMuted }}> / {xpForNextLevel} XP</Text>
        </View>
        <View style={styles.xpBarContainer}>
          <Animated.View
            style={[
              styles.xpBarTrack,
              {
                width: `${xpPercent * 100}%`,
              },
            ]}
          />
        </View>
        <Text style={{ ...caption, color: colors.textMuted }}>{progress.level_progress_pct}% до Lv.{level + 1}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1C22',
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#1E2128',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#23262E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E2128',
  },
  avatarText: {
    fontSize: 24,
  },
  levelBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#F5A524',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: '#0E0F12',
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E0F12',
  },
  info: {
    flex: 1,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  classIcon: {
    fontSize: 14,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  xpInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  xpBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#1E2128',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: SPACING.xs,
  },
  xpBarTrack: {
    height: '100%',
    backgroundColor: '#F5A524',
    borderRadius: 3,
  },
});

export default PlayerHeader;