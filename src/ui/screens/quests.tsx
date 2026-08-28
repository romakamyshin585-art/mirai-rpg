/**
 * Quests screen — list + filter by category + tap to complete.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, FlatList, Pressable, Alert, Text as RNText } from 'react-native';
import { Card, H1, H3, Muted, Button, Pill, Text } from '../components';
import { AppContext } from '../app_context';
import { COLORS, CATEGORY_COLORS, CATEGORY_LABELS, FONT, SPACING } from '../theme';
import { CATEGORIES, type Category } from '../../domain/category';
import type { QuestRow } from '../../repos/quest_repo';
import { CreateQuestModal } from '../create_quest_modal';

export function QuestsScreen({ ctx, onQuestCompleted }: { ctx: AppContext; onQuestCompleted: (unlocked: string[]) => void }) {
  const [filter, setFilter] = useState<Category | null>(null);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    const all = await ctx.quest.list(ctx.userId, filter ? { category: filter } : undefined);
    setQuests(all);
  }, [ctx, filter]);

  useEffect(() => { reload(); }, [reload]);

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
    setFilter(null);  // show all to see new one
    await reload();
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        <H1>Квесты</H1>
        <View style={{ height: SPACING.md }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
          <Pill label="Все" color={filter === null ? COLORS.accent : COLORS.textMuted} onPress={() => setFilter(null)} />
          {CATEGORIES.map((c) => (
            <Pill
              key={c}
              label={CATEGORY_LABELS[c]!}
              color={filter === c ? CATEGORY_COLORS[c] : COLORS.textMuted}
              onPress={() => setFilter(c)}
            />
          ))}
        </View>
        <View style={{ height: SPACING.md }} />
      </View>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 96 }}
        data={quests}
        keyExtractor={(q) => q.id}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: CATEGORY_COLORS[item.category], borderRadius: 2 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                  <H3 style={{ flex: 1 }}>{item.title}</H3>
                  {item.is_system === 0 ? (
                    <Pressable onPress={() => confirmArchive(item)} hitSlop={8}>
                      <Text color={COLORS.textMuted} size={FONT.tiny}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
                {item.description ? <Muted>{item.description}</Muted> : null}
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs, alignItems: 'center' }}>
                  <Text color={COLORS.accent} weight="700" size={FONT.body}>+{item.xp_reward} XP</Text>
                  <Text color={COLORS.textMuted} size={FONT.tiny}>· сложность {item.difficulty}/3</Text>
                  {item.is_system === 0 ? <Text color={COLORS.textDim} size={FONT.tiny}>· своё</Text> : null}
                </View>
              </View>
            </View>
            <View style={{ height: SPACING.sm }} />
            <Button
              title={busy === item.id ? '...' : 'Готово'}
              onPress={() => complete(item)}
              disabled={busy !== null}
            />
          </Card>
        )}
        ListEmptyComponent={
          <View style={{ padding: SPACING.xl, alignItems: 'center' }}>
            <Muted>Квестов пока нет — нажми +</Muted>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        onPress={() => setShowCreate(true)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: SPACING.lg,
          bottom: SPACING.lg,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: COLORS.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        })}
      >
        <RNText style={{ color: '#0E0F12', fontSize: 30, fontWeight: '700', lineHeight: 32 }}>＋</RNText>
      </Pressable>

      <CreateQuestModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={createQuest}
      />
    </View>
  );
}
