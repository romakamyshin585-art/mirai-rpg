/**
 * Quests screen — Vertical timeline flow with time-based grouping.
 * Focus Mode modal for active quest.
 * Performance improvements:
 * - Memoized groupByTime
 * - usePressAnimation for press feedback
 * - Stable FlatList keys
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, Alert, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { H1, H3, Muted, Button, Pill, Text } from '../components';
import { AppContext } from '../app_context';
import { useTheme } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import type { QuestRow } from '../../repos/quest_repo';
import { CreateQuestModal } from '../create_quest_modal';
import { FocusModeModal } from '../components/FocusModeModal';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../theme';
import { usePressAnimation, useHaptics, HAPTIC_EVENTS } from '../motion';

interface TimeGroup {
  time: string;
  quests: QuestRow[];
}

interface QuestTimelineItemProps {
  quest: QuestRow;
  categoryColor: string;
  onPress: () => void;
  onComplete: () => void;
  disabled: boolean;
  isBusy: boolean;
  onArchive: (q: QuestRow) => void;
  isSystem: boolean;
}

// Memoized time grouping - stable reference
const TIME_SLOTS = ['09:00', '12:30', '18:00', '20:00'];

function groupByTime(quests: QuestRow[]): TimeGroup[] {
  const timeMap = new Map<string, QuestRow[]>();
  
  quests.forEach((quest, index) => {
    const time = TIME_SLOTS[index % TIME_SLOTS.length];
    if (!timeMap.has(time)) timeMap.set(time, []);
    timeMap.get(time)!.push(quest);
  });
  
  return Array.from(timeMap.entries()).map(([time, quests]) => ({ time, quests }));
}

export function QuestsScreen({ ctx, onQuestCompleted }: { ctx: AppContext; onQuestCompleted: (unlocked: string[]) => void }) {
  const { colors, spacing, typography, motion } = useTheme();
  const { trigger } = useHaptics();
  
  const [filter, setFilter] = useState<Category | null>(null);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [focusQuest, setFocusQuest] = useState<QuestRow | null>(null);

  const reload = useCallback(async () => {
    const all = await ctx.quest.list(ctx.userId, filter ? { category: filter } : undefined);
    setQuests(all);
  }, [ctx, filter]);

  useEffect(() => { reload(); }, [reload]);

  // Memoized time groups
  const timeGroups = useMemo(() => groupByTime(quests), [quests]);

  async function complete(q: QuestRow) {
    setBusy(q.id);
    try {
      const r = await ctx.progression.completeQuest(ctx.userId, q.id);
      const unlocks = await ctx.achievement.checkAfterCompletion(ctx.userId, {
        completionAt: new Date(),
        category: r.category,
        questId: q.id,
        difficulty: q.difficulty,
        xpAwarded: r.xpAwarded,
      });
      onQuestCompleted(unlocks.map((u) => u.name));
      await reload();
      await trigger(HAPTIC_EVENTS.questComplete);
    } catch (e: any) {
      Alert.alert('Ошибка выполнения', e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  function confirmArchive(q: QuestRow) {
    Alert.alert(
      'Архивировать?',
      `«${q.title}» исчезнет из списка. Данные о выполнении сохранятся.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Архивировать',
          style: 'destructive',
          onPress: async () => {
            await ctx.quest.archive(q.id);
            await reload();
          },
        },
      ],
    );
  }

  async function createQuest(data: { title: string; description: string | null; category: Category; difficulty: 1 | 2 | 3; xp_reward: number }) {
    await ctx.quest.create(ctx.userId, {
      title: data.title,
      description: data.description ?? undefined,
      category: data.category,
      difficulty: data.difficulty,
      xp_reward: data.xp_reward,
    });
    setFilter(null);
    await reload();
  }

  function openFocusMode(q: QuestRow) {
    setFocusQuest(q);
    trigger(HAPTIC_EVENTS.tabPress);
  }

  function closeFocusMode() {
    setFocusQuest(null);
  }

  function handleQuestComplete(q: QuestRow) {
    complete(q);
    closeFocusMode();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <H1>Квесты</H1>
        <View style={styles.filterRow}>
          <Pill label="Все" color={filter === null ? colors.accent : colors.textMuted} onPress={() => setFilter(null)} />
          {CATEGORIES.map((c) => (
            <Pill
              key={c}
              label={CATEGORY_LABELS[c]!}
              color={filter === c ? CATEGORY_COLORS[c] : colors.textMuted}
              onPress={() => setFilter(c)}
            />
          ))}
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={timeGroups}
        keyExtractor={(g) => g.time}
        ItemSeparatorComponent={() => <View style={styles.timeSeparator} />}
        renderItem={({ item }) => (
          <View style={styles.timeGroup}>
            <View style={styles.timeLabel}>
              <Text style={{ ...typography.section, color: colors.accent }}>{item.time}</Text>
              <Text style={{ ...typography.caption, color: colors.textMuted }}>{item.quests.length} квест{item.quests.length > 1 ? 'а' : ''}</Text>
            </View>
            <View style={styles.questsStack}>
              {item.quests.map((quest) => (
                <QuestTimelineItem
                  key={quest.id}
                  quest={quest}
                  categoryColor={colors['cat' + quest.category.charAt(0).toUpperCase() + quest.category.slice(1) as keyof typeof colors]}
                  onPress={() => openFocusMode(quest)}
                  onComplete={() => complete(quest)}
                  disabled={busy !== null}
                  isBusy={busy === quest.id}
                  onArchive={confirmArchive}
                  isSystem={quest.is_system === 1}
                />
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Muted>Квестов пока нет — нажми +</Muted>
          </View>
        }
      />

      <Pressable
        onPress={() => setShowCreate(true)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: spacing.lg,
          bottom: spacing.lg,
          width: 60,
          height: 60,
          borderRadius: 999,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.4,
          shadowRadius: 6,
          elevation: 6,
        })}
      >
        <Text style={{ color: '#0E0F12', fontSize: 30, fontWeight: '700', lineHeight: 32 }}>＋</Text>
      </Pressable>

      <CreateQuestModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={createQuest}
      />

      <FocusModeModal
        visible={focusQuest !== null}
        quest={focusQuest}
        onClose={closeFocusMode}
        onComplete={handleQuestComplete}
      />
    </View>
  );
}

function QuestTimelineItem({ 
  quest, 
  categoryColor, 
  onPress, 
  onComplete, 
  disabled, 
  isBusy, 
  onArchive,
  isSystem 
}: QuestTimelineItemProps) {
  const { colors, spacing, typography, motion } = useTheme();
  const { pressIn, pressOut, pressStyle } = usePressAnimation();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={({ pressed }) => [
        styles.questCard,
        pressed && { opacity: 0.8 },
      ]}
      disabled={disabled}
    >
      <Animated.View style={pressStyle}>
        <View style={styles.questRow}>
          <View style={[styles.categoryBar, { backgroundColor: categoryColor }]} />
          <View style={styles.questContent}>
            <View style={styles.questHeader}>
              <H3 style={{ flex: 1 }}>{quest.title}</H3>
              {!isSystem && (
                <Pressable onPress={() => onArchive(quest)} hitSlop={8}>
                  <Text color={colors.textMuted} size={12}>✕</Text>
                </Pressable>
              )}
            </View>
            {quest.description && <Muted>{quest.description}</Muted>}
            <View style={styles.questMeta}>
              <Text style={{ fontFamily: 'Nunito', fontSize: 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] as any, color: colors.accent }}>+{quest.xp_reward} XP</Text>
              <Text style={{ fontFamily: 'Nunito', fontSize: 12, lineHeight: 16, fontWeight: '400', color: colors.textMuted }}>· сложность {quest.difficulty}/3</Text>
              {!isSystem && <Text style={{ fontFamily: 'Nunito', fontSize: 12, lineHeight: 16, fontWeight: '400', color: colors.textMuted }}>· своё</Text>}
            </View>
          </View>
          <View style={styles.questAction}>
            <Button
              title={isBusy ? '...' : 'Готово'}
              onPress={onComplete}
              disabled={disabled}
            />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0F12',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  timeSeparator: {
    height: 16,
  },
  timeGroup: {
    gap: 8,
  },
  timeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#1A1C22',
    borderRadius: 8,
  },
  questsStack: {
    gap: 8,
  },
  questCard: {
    backgroundColor: '#1A1C22',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2128',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  categoryBar: {
    width: 4,
    height: '100%',
    borderRadius: 2,
  },
  questContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  questHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  questMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  questAction: {
    minWidth: 100,
  },
  completeButton: {
    minWidth: 100,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
});

export default QuestsScreen;