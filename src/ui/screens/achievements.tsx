/**
 * Achievements screen — list of catalog with locked/unlocked state.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Card, H1, H2, H3, Muted, Text } from '../components';
import { AppContext } from '../app_context';
import { COLORS, RARITY_COLORS, FONT, SPACING } from '../theme';
interface CatalogRow {
  id: string;
  code: string;
  name: string;
  description: string;
  rarity: string;
  icon: string;
}

interface UnlockRow {
  code: string;
  name: string;
  description: string;
  rarity: string;
  icon: string;
  unlockedAt: string;
}

export function AchievementsScreen({ ctx }: { ctx: AppContext }) {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [unlocked, setUnlocked] = useState<UnlockRow[]>([]);

  const reload = useCallback(async () => {
    setCatalog(await ctx.achievement.listCatalog() as any);
    setUnlocked(await ctx.achievement.listUnlocked(ctx.userId) as any);
  }, [ctx]);

  useEffect(() => { reload(); }, [reload]);

  const unlockedIds = new Set(unlocked.map((u) => u.name));
  const unlockedRows = unlocked;
  const lockedRows = catalog.filter((c) => !unlockedIds.has(c.name));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
      <H1>Достижения</H1>
      <Muted>Открыто {unlocked.length} из {catalog.length}</Muted>

      {unlockedRows.length > 0 ? (
        <>
          <H2>Полученные</H2>
          {unlockedRows.map((a) => (
            <Card key={a.name} elevated>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <Text size={36}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <H3>{a.name}</H3>
                  <Muted>{a.description}</Muted>
                  <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs }}>
                    <Text color={RARITY_COLORS[a.rarity] ?? COLORS.text} size={FONT.tiny} weight="600">{a.rarity.toUpperCase()}</Text>
                    <Muted>· {new Date(a.unlockedAt).toLocaleDateString()}</Muted>
                  </View>
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {lockedRows.length > 0 ? (
        <>
          <H2>Не открыты</H2>
          {lockedRows.map((a) => (
            <Card key={a.code} style={{ opacity: 0.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <Text size={36}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <H3>{a.name}</H3>
                  <Muted>{a.description}</Muted>
                  <Text color={RARITY_COLORS[a.rarity] ?? COLORS.text} size={FONT.tiny} weight="600">{a.rarity.toUpperCase()}</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
