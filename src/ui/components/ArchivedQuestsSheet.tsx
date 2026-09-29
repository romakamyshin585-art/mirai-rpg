/**
 * Archived quests sheet.
 *
 * Why this exists: the catalogue ships 226 quests, the only control on a
 * card is an "x", and archiving is a soft delete with no way back. On the
 * device the counter went 226 → 4 in one sitting with no way to undo it
 * except wiping the app's data. Deleting something needs a reverse gear,
 * and this is it.
 *
 * Placement: a single quiet row at the bottom of the quests list, shown
 * only when something is actually hidden, so the common case is unchanged.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import type { QuestRow } from '../../repos/quest_repo';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { ConfirmDialog } from './ConfirmDialog';
import { MotionPressable } from './MotionPressable';
import { Overlay } from './Overlay';
import { spring, useReducedMotion } from '../motion';

const ICONS: Record<string, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

export function ArchivedQuestsSheet({
  ctx,
  revision,
  visible,
  onClose,
  onRestored,
}: {
  ctx: AppContext;
  revision: number;
  visible: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [rows, setRows] = useState<QuestRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuestRow | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      progress.value = withTiming(0, { duration: 140 });
    } else {
      progress.value = reduced
        ? withTiming(1, { duration: 180 })
        : withSpring(1, spring.sheet);
    }
    return () => cancelAnimation(progress);
  }, [progress, reduced, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void ctx.quest
      .listArchived(ctx.userId)
      .then(list => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, revision, visible]);

  const restore = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await ctx.quest.restore(id);
        setRows(current => current.filter(row => row.id !== id));
        onRestored();
      } finally {
        setBusyId(null);
      }
    },
    [ctx, onRestored],
  );

  const sheetMaxHeight = Math.max(320, Math.min(height * 0.82, height - insets.top - 24));

  const hardDelete = useCallback(async () => {
    const quest = pendingDelete;
    if (!quest) return;
    setBusyId(quest.id);
    try {
      await ctx.quest.hardDelete(quest.id, ctx.userId);
      setRows(current => current.filter(row => row.id !== quest.id));
      setPendingDelete(null);
      onRestored();
    } finally {
      setBusyId(null);
    }
  }, [ctx, onRestored, pendingDelete]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ translateY: (1 - progress.value) * 44 }],
  }));

  return (
    <>
      <Overlay visible={visible} onClose={onClose} align="bottom" panTarget="handle">
        <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            paddingBottom: insets.bottom + 18,
            // Pixel bound, not a percentage: this sheet sits inside an
            // auto-height wrapper, where a percentage maxHeight resolves to
            // auto in Yoga and the list below is never given a scroll box -
            // the rows then keep their natural height and the tail runs off
            // the screen instead of scrolling.
            maxHeight: sheetMaxHeight,
          },
          sheetStyle,
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <View>
            <Text style={[typography.title, { color: colors.text }]}>Скрытые квесты</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {rows.length === 0
                ? 'Ничего не скрыто'
                : `${rows.length} — их можно вернуть в список в один тап`}
            </Text>
          </View>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            style={[styles.close, { backgroundColor: colors.surfaceElevated }]}
          >
            <LucideIcon name="x" size={19} color={colors.textSecondary} />
          </MotionPressable>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceElevated }]}>
              <LucideIcon name="archive-restore" size={28} color={colors.textMuted} />
            </View>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Ты ничего не удалял. Квест, который скрыть, исчезает с этой вкладки, но остаётся здесь.
            </Text>
          </View>
        ) : (
          // Scrollable, and it has to be: the whole point of this sheet is
          // that a large number of quests can be hidden at once, and a
          // plain View inside a maxHeight sheet would just clip the tail.
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {rows.map(row => {
              const tint = colors[`cat${row.category.charAt(0).toUpperCase()}${row.category.slice(1)}` as keyof typeof colors];
              return (
                <View
                  key={row.id}
                  style={[styles.row, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: `${tint}20` }]}>
                    <LucideIcon name={ICONS[row.category] ?? 'circle'} size={17} color={tint} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={[typography.bodyStrong, { color: colors.text }]}>
                      {row.title}
                    </Text>
                    <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
                      {CATEGORY_LABELS[row.category]} · +{row.xp_reward} XP
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <MotionPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Вернуть в список: ${row.title}`}
                      disabled={busyId === row.id}
                      onPress={() => void restore(row.id)}
                      style={[styles.restore, { backgroundColor: colors.accentSoft, borderRadius: radius.sm, opacity: busyId === row.id ? 0.6 : 1 }]}
                    >
                      {busyId === row.id ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <>
                          <LucideIcon name="rotate-ccw" size={15} color={colors.accent} strokeWidth={2.4} />
                          <Text style={[styles.restoreLabel, { color: colors.accent }]}>Вернуть</Text>
                        </>
                      )}
                    </MotionPressable>
                    <MotionPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Удалить навсегда: ${row.title}`}
                      disabled={busyId === row.id}
                      onPress={() => setPendingDelete(row)}
                      style={[styles.delete, { borderRadius: radius.sm }]}
                    >
                      <LucideIcon name="trash-2" size={15} color={colors.danger} strokeWidth={2.2} />
                    </MotionPressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
        </Animated.View>
      </Overlay>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Удалить навсегда?"
        subject={pendingDelete ? `«${pendingDelete.title}»` : ''}
        message="Вернуть квест будет нельзя. Если по нему есть завершения, они тоже удалятся — вместе с записью в календаре. XP, уже зачисленный в область, останется."
        icon="trash-2"
        confirmLabel="Удалить"
        cancelLabel="Оставить скрытым"
        onConfirm={() => void hardDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { width: '100%', borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 10, flexShrink: 1 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 14 },
  emptyIcon: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  list: { marginTop: 16, flexGrow: 0, flexShrink: 1, minHeight: 0 },
  listContent: { gap: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  restore: { minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  delete: { minWidth: 38, minHeight: 38, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.45)' },
  restoreLabel: { fontFamily: 'Nunito', fontSize: 12, fontWeight: '800' },
});

export default ArchivedQuestsSheet;
