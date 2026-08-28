/**
 * Calendar screen — last 35 days as a heatmap + recent completions list.
 *
 * Heatmap: 7 rows (Mon→Sun) × 5 columns (weeks). Each cell coloured by
 * total XP earned that day (none/light/medium/strong/legendary).
 *
 * Recent list: 50 most recent quest_completion rows, joined with quest title.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Card, H1, H2, H3, Muted, Text } from '../components';
import { AppContext } from '../app_context';
import { COLORS, CATEGORY_COLORS, CATEGORY_LABELS, FONT, SPACING } from '../theme';
import type { Category } from '../../domain/category';
import { dayKey } from '../../domain/achievements';
import { CompletionRepo, QuestRepo } from '../../repos/quest_repo';

const DAYS_BACK = 35;

function intensityColor(xp: number): string {
  if (xp === 0) return COLORS.card;
  if (xp < 20) return '#3F2C1A';   // very low — dim warm
  if (xp < 50) return COLORS.accentDim;
  if (xp < 100) return COLORS.accent;
  if (xp < 200) return '#F5C232';
  return '#FDE68A';                // golden
}

interface DayCell {
  date: Date;
  key: string;
  xp: number;
}

export function CalendarScreen({ ctx }: { ctx: AppContext }) {
  const [days, setDays] = useState<DayCell[]>([]);
  const [recent, setRecent] = useState<Array<{
    at: Date;
    title: string;
    category: Category;
    xp: number;
  }>>([]);

  const reload = useCallback(async () => {
    const cRepo = new CompletionRepo(ctx.db);
    const qRepo = new QuestRepo(ctx.db);
    const today = new Date();
    // Build 35-day window
    const cells: DayCell[] = [];
    for (let i = DAYS_BACK - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const xp = await cRepo.sumXpForDay(ctx.userId, k);
      cells.push({ date: d, key: k, xp });
    }
    setDays(cells);
    // Recent 50
    const recentRows = await cRepo.listRecent(ctx.userId, 50);
    const enriched: typeof recent = [];
    for (const r of recentRows) {
      const q = await qRepo.getById(r.quest_id);
      enriched.push({
        at: new Date(r.completed_at),
        title: q?.title ?? '—',
        category: r.category,
        xp: r.xp_awarded,
      });
    }
    setRecent(enriched);
  }, [ctx]);

  useEffect(() => { reload(); }, [reload]);

  // Group by week (columns of 7 days, oldest at top-left)
  // days is already sorted oldest→newest; split into chunks of 7
  const weeks: DayCell[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const totalXp = days.reduce((s, d) => s + d.xp, 0);
  const activeDays = days.filter((d) => d.xp > 0).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
      <H1>Календарь</H1>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Muted>За {DAYS_BACK} дней</Muted>
            <H2>{totalXp} XP</H2>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Muted>Активных дней</Muted>
            <H2>{activeDays} / {DAYS_BACK}</H2>
          </View>
        </View>
      </Card>

      <H3>Карта активности</H3>
      <Card>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {weeks.map((week, wi) => (
            <View key={wi} style={{ gap: 4 }}>
              {week.map((d) => (
                <View
                  key={d.key}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    backgroundColor: intensityColor(d.xp),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text color={d.xp > 80 ? '#0E0F12' : COLORS.textMuted} size={FONT.tiny}>{d.date.getDate()}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View style={{ height: SPACING.md }} />
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text color={COLORS.textMuted} size={FONT.tiny}>меньше</Text>
          {['#3F2C1A', COLORS.accentDim, COLORS.accent, '#F5C232', '#FDE68A'].map((c) => (
            <View key={c} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c }} />
          ))}
          <Text color={COLORS.textMuted} size={FONT.tiny}>больше</Text>
        </View>
      </Card>

      <H2>История</H2>
      {recent.length === 0 ? (
        <Card><Muted>Пока нет выполненных квестов</Muted></Card>
      ) : (
        recent.map((r, i) => (
          <Card key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: CATEGORY_COLORS[r.category], borderRadius: 2 }} />
              <View style={{ flex: 1 }}>
                <H3>{r.title}</H3>
                <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
                  <Text color={COLORS.textMuted} size={FONT.tiny}>{CATEGORY_LABELS[r.category]}</Text>
                  <Text color={COLORS.textDim} size={FONT.tiny}>·</Text>
                  <Text color={COLORS.textMuted} size={FONT.tiny}>
                    {r.at.toLocaleDateString()} {r.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
              <Text color={COLORS.accent} weight="700" size={FONT.h3}>+{r.xp}</Text>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
