/**
 * Profile screen — character + stats + PB + sign out.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Card, H1, H2, H3, Muted, ProgressBar, Button, Text } from '../components';
import { AppContext } from '../app_context';
import { COLORS, CATEGORY_COLORS, CATEGORY_LABELS, FONT, SPACING } from '../theme';
import { CATEGORIES } from '../../domain/category';
import { levelProgress } from '../../domain/level';
import type { CharacterRow, StatRow } from '../../repos/character_repo';

const CLASS_LABEL: Record<string, string> = {
  warrior: '⚔️ Воин',
  scholar: '📚 Учёный',
  builder: '🔨 Строитель',
  monk: '🧘 Монах',
  leader: '👑 Лидер',
};

export function ProfileScreen({ ctx, onSignOut }: { ctx: AppContext; onSignOut: () => void }) {
  const [char, setChar] = useState<CharacterRow | null>(null);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [pbs, setPbs] = useState<Array<{ scope: string; value: number; achieved_at: string }>>([]);

  const reload = useCallback(async () => {
    const c = await ctx.character.get(ctx.userId);
    setChar(c);
    if (c) {
      setStats(await ctx.character.getStats(c.id));
      setPbs(await ctx.achievement.listPersonalBests(ctx.userId));
    }
  }, [ctx]);

  useEffect(() => { reload(); }, [reload]);

  if (!char) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg, padding: SPACING.lg }}><H1>Профиль</H1><Muted>Загрузка…</Muted></View>;
  }

  const progress = levelProgress(char.xp);
  const level = char.level;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
      <Card elevated>
        <Text color={COLORS.textMuted} size={FONT.small}>Уровень {level}</Text>
        <H1>{char.name ?? 'Hero'}</H1>
        {char.class ? <Text color={COLORS.accent} size={FONT.h3}>{CLASS_LABEL[char.class] ?? char.class}</Text> : <Muted>Класс ещё не определён</Muted>}
        <View style={{ height: SPACING.md }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Muted>{char.xp} XP</Muted>
          <Muted>{progress.level_progress_pct}% до {level + 1}</Muted>
        </View>
        <View style={{ height: SPACING.xs }} />
        <ProgressBar value={progress.xp_into_level} max={Math.max(1, progress.xp_for_next_level - progress.xp_into_level)} />
      </Card>

      <H2>Категории</H2>
      {CATEGORIES.map((c) => {
        const s = stats.find((x) => x.category === c);
        return (
          <Card key={c}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: CATEGORY_COLORS[c] }} />
                <H3>{CATEGORY_LABELS[c]}</H3>
              </View>
              <Text color={COLORS.accent} weight="700" size={FONT.h3}>{s?.xp_total_in_category ?? 0} XP</Text>
            </View>
            <Muted>Выполнено квестов: {s?.value ?? 0}</Muted>
          </Card>
        );
      })}

      {pbs.length > 0 ? (
        <>
          <H2>Рекорды</H2>
          {pbs.map((p) => (
            <Card key={p.scope}>
              <Text color={COLORS.textMuted} size={FONT.tiny}>{p.scope}</Text>
              <H3>{p.value} XP</H3>
              <Muted>{new Date(p.achieved_at).toLocaleDateString()}</Muted>
            </Card>
          ))}
        </>
      ) : null}

      <View style={{ height: SPACING.lg }} />
      <Button title="Выйти из аккаунта" onPress={onSignOut} variant="danger" />
    </ScrollView>
  );
}
