/**
 * App root. State-driven navigation: no @react-navigation, just
 * (tab, authState). The app is for one user, four screens.
 */

import { useEffect, useState } from 'react';
import { SafeAreaView, View, Pressable, Text, ActivityIndicator, StatusBar } from 'react-native';
import { AppContext } from './app_context';
import { LoginScreen } from './screens/login';
import { QuestsScreen } from './screens/quests';
import { ProfileScreen } from './screens/profile';
import { AchievementsScreen } from './screens/achievements';
import { CalendarScreen } from './screens/calendar';
import { ReportScreen } from './screens/report';
import { Toast } from './toast';
import { Share } from 'react-native';
import { COLORS, FONT, SPACING } from './theme';
import { initLogger, log, flushLogsNow } from '../services/logger';
import { useAction } from '../services/action_trace';

// (Share kept available for screens that import it from here)
export { Share };

type Tab = 'quests' | 'calendar' | 'profile' | 'achievements';
type AuthState = 'loading' | 'authed' | 'guest';
type Overlay = 'none' | 'report';

const INIT_TIMEOUT_MS = 15000;

export default function App() {
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [auth, setAuth] = useState<AuthState>('loading');
  const [tab, setTab] = useState<Tab>('quests');
  const [toast, setToast] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initStep, setInitStep] = useState('Запуск…');
  const [overlay, setOverlay] = useState<Overlay>('none');

  useEffect(() => {
    initLogger();
    log('INFO', 'App', '=== app started ===');
    let cancelled = false;
    // Watchdog — если init завис, покажем что именно висит
    const timeoutId = setTimeout(() => {
      if (cancelled || ctx) return;
      setInitStep((s) => '⚠️ Загрузка дольше 15с. Шаг: ' + s);
    }, INIT_TIMEOUT_MS);

    (async () => {
      try {
        setInitStep('Открытие БД…');
        const c = await AppContext.init();
        if (cancelled) return;
        setCtx(c);
        setInitStep('Проверка пользователя…');
        const isAuthed = await c.auth.isAuthenticated();
        const isRegistered = await c.auth.isRegistered();
        if (cancelled) return;
        if (!isRegistered) {
          setAuth('guest');
        } else {
          setAuth(isAuthed ? 'authed' : 'guest');
        }
        log('INFO', 'App', 'init complete, auth=' + auth);
      } catch (e: any) {
        log('ERROR', 'App', 'init failed: ' + (e?.message ?? e), { stack: e?.stack });
        if (!cancelled) setInitError(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      void flushLogsNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpenReport = useAction('App.openReport', () => {
    setOverlay('report');
  });
  const onCloseReport = useAction('App.closeReport', () => {
    setOverlay('none');
  });

  // Оверлей «Сообщить» — рендерится поверх всего, включая ошибки инициализации
  if (overlay === 'report') {
    return <ReportScreen onClose={onCloseReport} />;
  }

  if (initError) {
    return (
      <ErrorScreen
        title="Ошибка инициализации"
        message={initError}
        onOpenReport={onOpenReport}
      />
    );
  }

  if (!ctx || auth === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={{ color: COLORS.textMuted, marginTop: 16, fontSize: 13 }}>{initStep}</Text>
        <Text style={{ color: COLORS.textMuted, marginTop: 6, fontSize: 11 }}>Mirai RPG</Text>
        <Pressable onPress={onOpenReport} style={{ marginTop: 24, padding: 8 }}>
          <Text style={{ color: COLORS.accent, fontSize: 12 }}>Открыть лог / сообщить о баге</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (auth === 'guest') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <Pressable onPress={onOpenReport} style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 6 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>📋 Лог</Text>
        </Pressable>
        <LoginScreen ctx={ctx} onAuthenticated={() => setAuth('authed')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <View style={{ flex: 1 }}>
        <Pressable onPress={onOpenReport} style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, padding: 6 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>📋 Лог</Text>
        </Pressable>
        {tab === 'quests' ? (
          <QuestsScreen ctx={ctx} onQuestCompleted={(names) => {
            if (names.length > 0) setToast(`🏆 ${names.join(', ')}`);
          }} />
        ) : tab === 'calendar' ? (
          <CalendarScreen ctx={ctx} />
        ) : tab === 'profile' ? (
          <ProfileScreen ctx={ctx} onSignOut={async () => {
            await ctx.auth.signOut();
            setAuth('guest');
          }} />
        ) : (
          <AchievementsScreen ctx={ctx} />
        )}
        <BottomTab tab={tab} setTab={setTab} />
        <Toast message={toast} onHide={() => setToast(null)} />
      </View>
    </SafeAreaView>
  );
}

function ErrorScreen({ title, message, onOpenReport }: { title: string; message: string; onOpenReport: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: COLORS.danger, fontSize: 20, marginBottom: 12, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: COLORS.text, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>{message}</Text>
      <Pressable onPress={onOpenReport} style={{ padding: 14, backgroundColor: COLORS.accent, borderRadius: 8 }}>
        <Text style={{ color: COLORS.bg, fontWeight: '700' }}>📋 Открыть лог</Text>
      </Pressable>
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
          onPress={() => {
            log('ACTION', 'BottomTab', 'switch', { to: it.id });
            setTab(it.id);
          }}
          style={{ flex: 1, paddingVertical: SPACING.md, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 22, color: tab === it.id ? COLORS.accent : COLORS.textMuted }}>{it.icon}</Text>
          <Text style={{ fontSize: FONT.tiny, color: tab === it.id ? COLORS.accent : COLORS.textMuted, marginTop: 2 }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
