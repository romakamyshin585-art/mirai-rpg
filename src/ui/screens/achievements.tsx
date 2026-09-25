import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import type { AchievementDefRow, Rarity } from '../../repos/achievement_repo';
import type { UnlockedAchievement } from '../../services/achievement_service';
import { BOTTOM_NAV_BASE_HEIGHT, RARITY_COLORS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { Overlay } from '../components/Overlay';
import { MotionPressable } from '../components/MotionPressable';
import { MotionProgressBar } from '../components/MotionProgressBar';
import { duration, spring, useReducedMotion, useScrollHeader } from '../motion';

type Filter = 'all' | 'unlocked' | 'locked';

type AchievementItem = AchievementDefRow & {
  isUnlocked: boolean;
  unlockedAt?: string;
};

const ICONS: Record<string, string> = {
  first_step: 'footprints',
  first_quest: 'sprout',
  comeback: 'rotate-ccw',
  early_bird: 'sunrise',
  midnight_owl: 'moon',
  evening_zen: 'sparkles',
  weekend_warrior: 'shield',
  week_streak: 'flame',
  month_streak: 'crown',
  category_rainbow: 'rainbow',
  all_categories_today: 'cloud-lightning',
  health_balance: 'heart-pulse',
  variety_30: 'compass',
  variety_50: 'map',
  hardcore_5: 'skull',
  personal_record_day: 'trophy',
  category_personal_best: 'medal',
};

const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Обычное',
  rare: 'Редкое',
  epic: 'Эпическое',
  legendary: 'Легендарное',
};

type AchievementsScreenProps = {
  ctx: AppContext;
  revision: number;
  celebrationCodes?: string[];
};

export function AchievementsScreen({ ctx, revision, celebrationCodes }: AchievementsScreenProps) {
  const { colors, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { onScroll: onHeaderScroll, style: headerStyle } = useScrollHeader();
  const [catalog, setCatalog] = useState<AchievementDefRow[]>([]);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<AchievementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockedCelebrationCodes, setUnlockedCelebrationCodes] = useState<string[]>([]);
  const hasLoaded = useRef(false);

  useEffect(() => {
    setUnlockedCelebrationCodes(celebrationCodes ?? []);
  }, [celebrationCodes]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const newlyUnlocked = await ctx.achievement.syncFromHistory(ctx.userId);
      if (hasLoaded.current && newlyUnlocked.length > 0) {
        setUnlockedCelebrationCodes(current => [...new Set([...current, ...newlyUnlocked.map(item => item.code)])]);
      }
      hasLoaded.current = true;
      const [catalogRows, unlockedRows] = await Promise.all([
        ctx.achievement.listCatalog(),
        ctx.achievement.listUnlocked(ctx.userId),
      ]);
      setCatalog(catalogRows);
      setUnlocked(unlockedRows);
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

  const items = useMemo<AchievementItem[]>(() => {
    const byCode = new Map(unlocked.map(item => [item.code, item]));
    return catalog.map(item => {
      const match = byCode.get(item.code);
      return { ...item, isUnlocked: Boolean(match), unlockedAt: match?.unlockedAt };
    });
  }, [catalog, unlocked]);

  const visible = useMemo(() => {
    if (filter === 'unlocked') return items.filter(item => item.isUnlocked);
    if (filter === 'locked') return items.filter(item => !item.isUnlocked);
    return items;
  }, [filter, items]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loading, { color: colors.textMuted }]}>Проверяем твои достижения…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <LucideIcon name="cloud-off" size={38} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Достижения не загрузились</Text>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
        <MotionPressable
          accessibilityRole="button"
          onPress={() => void reload()}
          style={[styles.retry, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
        </MotionPressable>
      </View>
    );
  }

  const progress = catalog.length > 0 ? Math.round((unlocked.length / catalog.length) * 100) : 0;

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
              <Text style={[styles.title, typography.title, { color: colors.text }]}>Достижения</Text>
              <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Награды за твой прогресс</Text>
            </View>
            <View style={[styles.progressBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.progressValue, typography.numeric, { color: colors.accent }]}>{progress}%</Text>
              <Text style={[styles.progressLabel, typography.caption, { color: colors.textMuted }]}>открыто</Text>
            </View>
          </View>
        </Animated.View>

        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.summaryCopy}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{unlocked.length} из {catalog.length}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>наград получено</Text>
          </View>
          <MotionProgressBar
            value={progress / 100}
            trackColor={colors.surfaceFloating}
            fillColor={colors.accent}
            height={6}
            style={styles.summaryTrack}
            accessibilityLabel="Прогресс достижений"
          />
        </View>

        <View style={styles.filters}>
          <FilterButton label="Все" count={items.length} active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterButton label="Открытые" count={unlocked.length} active={filter === 'unlocked'} onPress={() => setFilter('unlocked')} />
          <FilterButton label="Закрытые" count={items.length - unlocked.length} active={filter === 'locked'} onPress={() => setFilter('locked')} />
        </View>

        <View style={styles.grid}>
          {visible.map(item => (
            <AchievementCard
              key={item.code}
              item={item}
              celebrating={unlockedCelebrationCodes.includes(item.code)}
              onPress={() => setSelected(item)}
            />
          ))}
        </View>
      </Animated.ScrollView>
      <AchievementDetails item={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function AchievementCard({ item, celebrating, onPress }: { item: AchievementItem; celebrating: boolean; onPress: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const rarityColor = RARITY_COLORS[item.rarity] ?? colors.textMuted;
  const reveal = useSharedValue(item.isUnlocked ? 1 : 0.92);
  const celebrationProgress = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    reveal.value = item.isUnlocked
      ? reduced
        ? withTiming(1, { duration: duration.reducedMotion })
        : withSpring(1, spring.card)
      : withTiming(0.92, { duration: duration.standard });
    if (!celebrating || !item.isUnlocked) return;
    celebrationProgress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withSequence(
          withTiming(1.12, { duration: duration.micro, easing: Easing.out(Easing.cubic) }),
          withSpring(1, spring.celebration),
        );
    glow.value = reduced
      ? withDelay(60, withSequence(withTiming(1, { duration: duration.reducedMotion }), withDelay(220, withTiming(0, { duration: duration.reducedMotion }))))
      : withDelay(60, withSequence(withTiming(1, { duration: duration.micro }), withDelay(220, withTiming(0, { duration: duration.standard, easing: Easing.out(Easing.cubic) }))));
  }, [celebrating, celebrationProgress, glow, item.isUnlocked, reduced, reveal]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: reduced ? [] : [{ scale: interpolate(celebrationProgress.value, [0.8, 1, 1.12], [0.98, 1, 1.04], Extrapolate.CLAMP) }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: reduced ? [] : [{ scale: celebrationProgress.value }, { rotate: `${interpolate(celebrationProgress.value, [0.8, 1, 1.12], [-3, 0, 3], Extrapolate.CLAMP)}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <Animated.View style={[styles.cardShell, shellStyle]}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.isUnlocked ? 'открыто' : 'закрыто'}`}
        onPress={onPress}
        style={[
          styles.card,
          {
            backgroundColor: item.isUnlocked ? colors.surface : colors.surfaceElevated,
            borderColor: item.isUnlocked ? `${rarityColor}88` : colors.borderSubtle,
            borderRadius: radius.lg,
          },
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.cardGlow, { backgroundColor: rarityColor }, glowStyle]} />
        <View style={styles.cardTop}>
          <Animated.View style={[styles.iconWrap, iconStyle, { backgroundColor: item.isUnlocked ? `${rarityColor}22` : colors.surfaceFloating, borderColor: item.isUnlocked ? `${rarityColor}66` : colors.border, borderRadius: radius.md }]}>
            <LucideIcon name={item.isUnlocked ? ICONS[item.code] ?? 'award' : 'lock'} size={27} color={item.isUnlocked ? rarityColor : colors.textMuted} />
          </Animated.View>
          {item.isUnlocked ? (
            <View style={[styles.check, { backgroundColor: colors.success }]}>
              <LucideIcon name="check" size={13} color={colors.bg} strokeWidth={3} />
            </View>
          ) : null}
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={2} style={[styles.cardTitle, typography.bodyStrong, { color: item.isUnlocked ? colors.text : colors.textSecondary }]}>
            {item.name}
          </Text>
          <Text numberOfLines={3} style={[styles.cardDescription, typography.caption, { color: colors.textMuted }]}>{item.description}</Text>
        </View>
        <View style={[styles.rarity, { backgroundColor: `${rarityColor}18` }]}>
          <Text style={[typography.caption, { color: rarityColor, fontWeight: '800' }]}>{RARITY_LABELS[item.rarity]}</Text>
        </View>
      </MotionPressable>
    </Animated.View>
  );
}

function FilterButton({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.filter,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.borderSubtle,
          borderRadius: radius.pill,
        },
      ]}
    >
      <Text style={[styles.filterLabel, typography.caption, { color: active ? colors.textInverse : colors.textMuted, fontWeight: '800' }]}>{label}</Text>
      <Text style={[styles.filterCount, typography.caption, { color: active ? colors.textInverse : colors.textSecondary }]}>{count}</Text>
    </MotionPressable>
  );
}

function AchievementDetails({ item, onClose }: { item: AchievementItem | null; onClose: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const rarityColor = item ? RARITY_COLORS[item.rarity] ?? colors.textMuted : colors.textMuted;

  return (
    <Overlay visible={item !== null} onClose={onClose} align="center">
      {item ? (
        <View style={[styles.detail, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
          <ScrollView
            style={styles.detailScroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.detailContent}
          >
            <View style={[styles.detailIcon, { backgroundColor: `${rarityColor}22`, borderColor: `${rarityColor}66` }]}>
              <LucideIcon name={item.isUnlocked ? ICONS[item.code] ?? 'award' : 'lock'} size={40} color={item.isUnlocked ? rarityColor : colors.textMuted} />
            </View>
            <Text style={[styles.detailRarity, typography.caption, { color: rarityColor, fontWeight: '800' }]}>{RARITY_LABELS[item.rarity]}</Text>
            <Text style={[styles.detailTitle, typography.title, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.detailDescription, typography.body, { color: colors.textSecondary }]}>{item.description}</Text>
            <View style={[styles.detailStatus, { backgroundColor: item.isUnlocked ? colors.successSoft : colors.surfaceElevated }]}>
              <LucideIcon name={item.isUnlocked ? 'badge-check' : 'lock-keyhole'} size={19} color={item.isUnlocked ? colors.success : colors.textMuted} />
              <Text style={[typography.bodyStrong, { color: item.isUnlocked ? colors.success : colors.textSecondary }]}>
                {item.isUnlocked ? 'Достижение открыто' : 'Продолжай выполнять квесты'}
              </Text>
            </View>
            {item.unlockedAt ? (
              <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
                {new Date(item.unlockedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            ) : null}
          </ScrollView>
          {/* Outside the scroll area: the way out is always one tap away,
              whatever the content height is. */}
          <View style={[styles.detailFooter, { borderTopColor: colors.borderSubtle }]}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={[styles.close, { backgroundColor: colors.accent, borderRadius: radius.md }]}
            >
              <Text style={[styles.closeLabel, { color: colors.textInverse }]}>Закрыть</Text>
            </MotionPressable>
          </View>
        </View>
      ) : null}
    </Overlay>
  );
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
  progressBadge: { minWidth: 68, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progressValue: { fontSize: 18, lineHeight: 22 },
  progressLabel: { fontSize: 10, lineHeight: 13 },
  summary: { minHeight: 76, borderWidth: 1, borderRadius: 18, padding: 14 },
  summaryCopy: { marginBottom: 10 },
  summaryTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  summaryFill: { height: '100%', borderRadius: 3 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { minHeight: 40, flex: 1, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  filterLabel: { fontSize: 11, lineHeight: 15 },
  filterCount: { fontSize: 11, lineHeight: 15, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cardShell: { width: '48%', position: 'relative' },
  card: { minHeight: 190, borderWidth: 1, padding: 12, position: 'relative', overflow: 'hidden' },
  cardGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, top: -50, right: -30, opacity: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  iconWrap: { width: 54, height: 54, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, marginTop: 10 },
  cardTitle: { fontSize: 14, lineHeight: 19 },
  cardDescription: { marginTop: 4 },
  rarity: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, marginTop: 8 },
  detail: { width: '100%', maxWidth: 420, maxHeight: '86%', alignSelf: 'center', borderWidth: 1, overflow: 'hidden' },
  detailScroll: { flexShrink: 1 },
  detailContent: { padding: 22, alignItems: 'center' },
  detailFooter: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, paddingTop: 12 },
  detailIcon: { width: 82, height: 82, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailRarity: { letterSpacing: 0.6 },
  detailTitle: { textAlign: 'center', marginTop: 5 },
  detailDescription: { textAlign: 'center', marginTop: 8 },
  detailStatus: { width: '100%', minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  close: { width: '100%', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
});

export default AchievementsScreen;
