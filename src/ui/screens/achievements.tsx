import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import type { AchievementDefRow, Rarity } from '../../repos/achievement_repo';
import type { UnlockedAchievement } from '../../services/achievement_service';
import { BOTTOM_NAV_BASE_HEIGHT, RARITY_COLORS, useTheme } from '../theme';
import { LucideIcon } from '../components';

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
};

export function AchievementsScreen({ ctx, revision }: AchievementsScreenProps) {
  const { colors, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<AchievementDefRow[]>([]);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<AchievementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      await ctx.achievement.syncFromHistory(ctx.userId);
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

  const progress = catalog.length > 0 ? Math.round((unlocked.length / catalog.length) * 100) : 0;

  return (
    <>
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
            <Text style={[styles.title, typography.title, { color: colors.text }]}>Достижения</Text>
            <Text style={[styles.subtitle, typography.caption, { color: colors.textMuted }]}>Награды за твой прогресс</Text>
          </View>
          <View style={[styles.progressBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.progressValue, typography.numeric, { color: colors.accent }]}>{progress}%</Text>
            <Text style={[styles.progressLabel, typography.caption, { color: colors.textMuted }]}>открыто</Text>
          </View>
        </View>

        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.summaryCopy}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{unlocked.length} из {catalog.length}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>наград получено</Text>
          </View>
          <View style={[styles.summaryTrack, { backgroundColor: colors.surfaceFloating }]}>
            <View style={[styles.summaryFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>

        <View style={styles.filters}>
          <FilterButton label="Все" count={items.length} active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterButton label="Открытые" count={unlocked.length} active={filter === 'unlocked'} onPress={() => setFilter('unlocked')} />
          <FilterButton label="Закрытые" count={items.length - unlocked.length} active={filter === 'locked'} onPress={() => setFilter('locked')} />
        </View>

        <View style={styles.grid}>
          {visible.map(item => (
            <AchievementCard key={item.code} item={item} onPress={() => setSelected(item)} />
          ))}
        </View>
      </ScrollView>
      <AchievementDetails item={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function AchievementCard({ item, onPress }: { item: AchievementItem; onPress: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const rarityColor = RARITY_COLORS[item.rarity] ?? colors.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.isUnlocked ? 'открыто' : 'закрыто'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: item.isUnlocked ? colors.surface : colors.surfaceElevated,
          borderColor: item.isUnlocked ? `${rarityColor}88` : colors.borderSubtle,
          borderRadius: radius.lg,
          opacity: pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: item.isUnlocked ? `${rarityColor}22` : colors.surfaceFloating,
              borderColor: item.isUnlocked ? `${rarityColor}66` : colors.border,
              borderRadius: radius.md,
            },
          ]}
        >
          <LucideIcon name={item.isUnlocked ? ICONS[item.code] ?? 'award' : 'lock'} size={27} color={item.isUnlocked ? rarityColor : colors.textMuted} />
        </View>
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
    </Pressable>
  );
}

function FilterButton({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.borderSubtle,
          borderRadius: radius.pill,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.filterLabel, typography.caption, { color: active ? colors.textInverse : colors.textMuted, fontWeight: '800' }]}>{label}</Text>
      <Text style={[styles.filterCount, typography.caption, { color: active ? colors.textInverse : colors.textSecondary }]}>{count}</Text>
    </Pressable>
  );
}

function AchievementDetails({ item, onClose }: { item: AchievementItem | null; onClose: () => void }) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const rarityColor = item ? RARITY_COLORS[item.rarity] ?? colors.textMuted : colors.textMuted;

  return (
    <Modal visible={item !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.modalRoot, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} style={StyleSheet.absoluteFillObject} />
        {item ? (
          <View style={[styles.detail, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
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
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.close, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: pressed ? 0.82 : 1 }]}
            >
              <Text style={[styles.closeLabel, { color: colors.textInverse }]}>Закрыть</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
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
  card: { width: '48%', minHeight: 190, borderWidth: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  iconWrap: { width: 54, height: 54, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, marginTop: 10 },
  cardTitle: { fontSize: 14, lineHeight: 19 },
  cardDescription: { marginTop: 4 },
  rarity: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, marginTop: 8 },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: 'rgba(0,0,0,0.7)' },
  detail: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 1, padding: 22, alignItems: 'center' },
  detailIcon: { width: 82, height: 82, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailRarity: { letterSpacing: 0.6 },
  detailTitle: { textAlign: 'center', marginTop: 5 },
  detailDescription: { textAlign: 'center', marginTop: 8 },
  detailStatus: { width: '100%', minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  close: { width: '100%', minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  closeLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
});

export default AchievementsScreen;
