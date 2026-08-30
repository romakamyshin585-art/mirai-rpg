/**
 * App root. Single-user: no auth flow, no login screen. After init,
 * goes straight to the four-tab main UI.
 */

import { useEffect, useState } from 'react';
import { SafeAreaView, View, Pressable, Text, ActivityIndicator, StatusBar } from 'react-native';
import { AppContext } from './app_context';
import { QuestsScreen } from './screens/quests';
import { ProfileScreen } from './screens/profile';
import { AchievementsScreen } from './screens/achievements';
import { CalendarScreen } from './screens/calendar';
import { Toast } from './toast';
import { COLORS, FONT, SPACING } from './theme';

type Tab = 'quests' | 'calendar' | 'profile' | 'achievements';

export default function App() {
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<Tab>('quests');
  const [toast, setToast] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await AppContext.init();
        if (cancelled) return;
        setCtx(c);
      } catch (e: any) {
        if (!cancelled) setInitError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (initError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: COLORS.danger, fontSize: 18, marginBottom: 12 }}>Ошибка инициализации</Text>
        <Text style={{ color: COLORS.text, fontSize: 13, textAlign: 'center' }}>{initError}</Text>
      </SafeAreaView>
    );
  }

  if (!ctx) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <View style={{ flex: 1 }}>
        {tab === 'quests' ? (
          <QuestsScreen ctx={ctx} onQuestCompleted={(names) => {
            if (names.length > 0) setToast(`🏆 ${names.join(', ')}`);
          }} />
        ) : tab === 'calendar' ? (
          <CalendarScreen ctx={ctx} />
        ) : tab === 'profile' ? (
          <ProfileScreen ctx={ctx} />
        ) : (
          <AchievementsScreen ctx={ctx} />
        )}
        <BottomTab tab={tab} setTab={setTab} />
        <Toast message={toast} onHide={() => setToast(null)} />
      </View>
    </SafeAreaView>
  );
}

function BottomTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'quests',       label: 'Квесты',       icon: '⚡' },
    { id: 'calendar',     label: 'Календарь',    icon: '📅' },
    { id: 'profile',      label: 'Профиль',      icon: '👤' },
    { id: 'achievements', label: 'Награды',      icon: '🏆' },
  ];
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.card }}>
      {items.map((it) => (
        <Pressable
          key={it.id}
          onPress={() => setTab(it.id)}
          style={{ flex: 1, paddingVertical: SPACING.md, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 22, color: tab === it.id ? COLORS.accent : COLORS.textMuted }}>{it.icon}</Text>
          <Text style={{ fontSize: FONT.tiny, color: tab === it.id ? COLORS.accent : COLORS.textMuted, marginTop: 2 }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
