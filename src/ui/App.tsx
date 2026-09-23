/**
 * App root. Single-user: no auth flow, no login screen. After init,
 * goes straight to the five-tab main UI.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { SafeAreaView, View, Pressable, Text, ActivityIndicator, StatusBar, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { AppContext } from './app_context';
import { QuestsScreen } from './screens/quests';
import { ProfileScreen } from './screens/profile';
import { AchievementsScreen } from './screens/achievements';
import { CalendarScreen } from './screens/calendar';
import { HomeScreen } from './screens/home';
import { Toast } from './toast';
import { ThemeProvider, useTheme } from './theme';
import { useNunitoFonts } from './fonts';
import { LucideIcon } from './components';
import { usePressAnimation, useHaptics, HAPTIC_EVENTS } from './motion';

type Tab = 'home' | 'quests' | 'calendar' | 'achievements' | 'profile';

function AppContent() {
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initStage, setInitStage] = useState<string>('starting');
  const [retryCount, setRetryCount] = useState(0);
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useNunitoFonts();
  const fontTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleInitError = useCallback((error: Error, stage: string) => {
    const msg = `${stage}: ${error?.message || String(error)}`;
    console.error('[MiraiRPG] Init failed:', msg);
    setInitError(msg);
    setInitStage('error');
  }, []);

  useEffect(() => {
    // Font loading timeout fallback (10 seconds)
    fontTimeoutRef.current = setTimeout(() => {
      if (!fontsLoaded) {
        console.warn('[MiraiRPG] Font loading timeout, proceeding anyway');
      }
    }, 10000);

    let cancelled = false;
    (async () => {
      try {
        setInitStage('opening-db');
        console.log('[MiraiRPG] Opening database...');
        const c = await AppContext.init();
        if (cancelled) return;
        setInitStage('db-ready');
        console.log('[MiraiRPG] Database ready, creating character...');
        setCtx(c);
        setInitStage('complete');
      } catch (e: any) {
        if (!cancelled) handleInitError(e, initStage);
      }
    })();
    return () => { 
      cancelled = true; 
      if (fontTimeoutRef.current) clearTimeout(fontTimeoutRef.current);
    };
  }, [fontsLoaded, handleInitError, retryCount]);

  // Allow proceeding even if fonts fail to load (show warning but don't block)
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={{ color: colors.textMuted, marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          Загрузка шрифтов...{fontError ? `\n${fontError.message}` : ''}
        </Text>
      </View>
    );
  }

  if (initError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: colors.danger, fontSize: 18, marginBottom: 12, textAlign: 'center' }}>Ошибка инициализации</Text>
        <Text style={{ color: colors.text, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>{initError}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 16 }}>
          Этап: {initStage}
        </Text>
        <Pressable
          onPress={() => { 
            setCtx(null);
            setInitError(null); 
            setInitStage('starting');
            setRetryCount(c => c + 1);
            // Reset singleton so init can restart fresh
            AppContext.resetInstance();
          }}
          style={{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: colors.accent, borderRadius: 12 }}
        >
          <Text style={{ color: colors.bg, fontWeight: '600', fontSize: 14 }}>Повторить</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!ctx) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={{ color: colors.textMuted, marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          Инициализация... ({initStage})
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={{ flex: 1 }}>
        {tab === 'home' ? (
          <HomeScreen ctx={ctx} />
        ) : tab === 'quests' ? (
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

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const TABS: Array<{ key: Tab; icon: string; label: string }> = [
  { key: 'home', icon: 'layout-dashboard', label: 'Home' },
  { key: 'quests', icon: 'zap', label: 'Quests' },
  { key: 'calendar', icon: 'calendar', label: 'Calendar' },
  { key: 'achievements', icon: 'trophy', label: 'Achievements' },
  { key: 'profile', icon: 'user', label: 'Profile' },
];

function BottomTab({
  tab,
  setTab,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const { colors, spacing, motion } = useTheme();
  const { pressIn, pressOut, pressStyle } = usePressAnimation();
  const { trigger } = useHaptics();

  const targetIndex = useSharedValue(TABS.findIndex(t => t.key === tab));

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: withTiming(1, { duration: motion.durations.normal }),
  }), [motion.durations.normal]);

  const handlePress = (index: number) => {
    trigger(HAPTIC_EVENTS.tabPress);
    targetIndex.value = withSpring(index, { damping: 22, stiffness: 200 });
    setTab(TABS[index].key);
  };

  // Derive active index for rendering
  const activeIndex = useMemo(() => TABS.findIndex(t => t.key === tab), [tab]);

  // Smooth indicator animation
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(targetIndex.value, [0, 1, 2, 3, 4], [12, 84, 156, 228, 300]) }],
  }));

  return (
<Animated.View style={[styles.container, backgroundStyle]}>
        {/* Reduced blur intensity for better Android performance */}
        {Platform.OS === 'ios' ? (
          <BlurView
            style={StyleSheet.absoluteFillObject}
            intensity={40}
            tint="dark"
          />
        ) : (
          <View style={styles.backgroundFallback} pointerEvents="none" />
        )}
        <View style={styles.content} pointerEvents="box-none">
        <View style={styles.indicatorWrapper}>
          <Animated.View style={[styles.indicator, indicatorStyle]} />
        </View>
        <View style={styles.tabsRow}>
          {TABS.map((t, index) => {
            const isActive = activeIndex === index;
            return (
              <Pressable
                key={t.key}
                onPress={() => handlePress(index)}
                onPressIn={pressIn}
                onPressOut={pressOut}
                style={({ pressed }) => [
                  styles.tabItem,
                  { flex: 1, paddingVertical: spacing.md },
                  pressed && { opacity: 0.8 },
                ]}
                hitSlop={{ top: 10, bottom: 24, left: 8, right: 8 }}
              >
                <Animated.View style={pressStyle}>
                  <View style={styles.iconWrapper}>
                    <LucideIcon
                      name={t.icon}
                      size={24}
                      color={isActive ? colors.accent : colors.textMuted}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                  </View>
                  <Text style={[
                    styles.label,
                    { fontSize: 11, marginTop: 4, fontWeight: isActive ? '600' : '500' },
                    { color: isActive ? colors.accent : colors.textMuted },
                  ]}>
                    {t.label}
                  </Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 88,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  backgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14, 15, 18, 0.85)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  indicatorWrapper: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    height: 48,
    pointerEvents: 'none',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 60,
    width: 60,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 165, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 165, 36, 0.2)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Nunito',
  },
});