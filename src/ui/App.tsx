import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Text, ActivityIndicator, StatusBar, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppContext } from './app_context';
import { QuestsScreen } from './screens/quests';
import { ProfileScreen } from './screens/profile';
import { AchievementsScreen } from './screens/achievements';
import { CalendarScreen } from './screens/calendar';
import { HomeScreen } from './screens/home';
import { Toast } from './toast';
import { BOTTOM_NAV_BASE_HEIGHT, ThemeProvider, useTheme } from './theme';
import { useNunitoFonts } from './fonts';
import { LucideIcon } from './components';
import { HAPTIC_EVENTS, useHaptics, usePressAnimation } from './motion';

type Tab = 'home' | 'quests' | 'calendar' | 'achievements' | 'profile';

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initStage, setInitStage] = useState('starting');
  const [retryCount, setRetryCount] = useState(0);
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useNunitoFonts();

  useEffect(() => {
    if (fontsLoaded) console.log('[MiraiRPG] Fonts ready');
    if (fontError) console.warn('[MiraiRPG] Font fallback:', fontError);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    let cancelled = false;
    let stage = 'starting';

    const initialize = async () => {
      try {
        stage = 'opening-db';
        setInitStage(stage);
        const context = await AppContext.init();
        if (cancelled) return;
        stage = 'complete';
        setInitStage(stage);
        setCtx(context);
      } catch (error) {
        if (cancelled) return;
        const value = error instanceof Error ? error : new Error(String(error));
        console.error('[MiraiRPG] Init failed:', value);
        setInitError(`${stage}: ${value.message}`);
        setInitStage('error');
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const markDataChanged = useCallback(() => {
    setRevision(value => value + 1);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  if (initError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Ошибка инициализации</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>{initError}</Text>
        <Text style={[styles.stageText, { color: colors.textMuted }]}>Этап: {initStage}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            AppContext.resetInstance();
            setCtx(null);
            setInitError(null);
            setInitStage('starting');
            setRetryCount(value => value + 1);
          }}
          style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.accent, opacity: pressed ? 0.82 : 1 }]}
        >
          <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  if (!ctx) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loadingLabel, { color: colors.textMuted }]}>Инициализация… {initStage}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.app, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.screenHost}>
        {tab === 'home' ? (
          <HomeScreen ctx={ctx} revision={revision} onOpenQuests={() => setTab('quests')} />
        ) : tab === 'quests' ? (
          <QuestsScreen
            ctx={ctx}
            revision={revision}
            onDataChanged={markDataChanged}
            onQuestCompleted={(notice) => {
              setToast({
                message: notice.message,
                actionLabel: 'Отменить',
                onAction: notice.undo,
              });
            }}
          />
        ) : tab === 'calendar' ? (
          <CalendarScreen ctx={ctx} revision={revision} />
        ) : tab === 'profile' ? (
          <ProfileScreen ctx={ctx} revision={revision} onOpenAchievements={() => setTab('achievements')} />
        ) : (
          <AchievementsScreen ctx={ctx} revision={revision} />
        )}
        <BottomTab tab={tab} onChange={setTab} />
        <Toast
          message={toast?.message ?? null}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction}
          onHide={hideToast}
          bottomOffset={BOTTOM_NAV_BASE_HEIGHT + insets.bottom + 12}
        />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.app}>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const TABS: Array<{ key: Tab; icon: string; label: string }> = [
  { key: 'home', icon: 'layout-dashboard', label: 'Home' },
  { key: 'quests', icon: 'zap', label: 'Quests' },
  { key: 'calendar', icon: 'calendar', label: 'Calendar' },
  { key: 'achievements', icon: 'trophy', label: 'Achievements' },
  { key: 'profile', icon: 'user', label: 'Profile' },
];

const INDICATOR_SIZE = 44;

function BottomTab({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { pressIn, pressOut, pressStyle } = usePressAnimation();
  const { trigger } = useHaptics();
  const activeIndex = TABS.findIndex(item => item.key === tab);
  const targetIndex = useSharedValue(activeIndex);
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    targetIndex.value = withSpring(activeIndex, { damping: 22, stiffness: 220 });
  }, [activeIndex, targetIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    const tabWidth = rowWidth / TABS.length;
    const offset = tabWidth * targetIndex.value + (tabWidth - INDICATOR_SIZE) / 2;
    return {
      opacity: rowWidth > 0 ? 1 : 0,
      transform: [{ translateX: offset }],
    };
  }, [rowWidth]);

  const selectTab = (next: Tab, index: number) => {
    void trigger(HAPTIC_EVENTS.tabPress);
    targetIndex.value = withSpring(index, { damping: 22, stiffness: 220 });
    onChange(next);
  };

  return (
    <Animated.View
      style={[
        styles.navContainer,
        {
          height: BOTTOM_NAV_BASE_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surfaceOverlay,
          borderTopColor: colors.borderSubtle,
        },
      ]}
    >
      {Platform.OS === 'ios' ? <BlurView style={StyleSheet.absoluteFillObject} intensity={42} tint="dark" /> : null}
      <View style={styles.navContent} pointerEvents="box-none">
        <View
          onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
          style={styles.navRow}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.navIndicator,
              {
                width: INDICATOR_SIZE,
                height: INDICATOR_SIZE,
                borderRadius: INDICATOR_SIZE / 2,
                backgroundColor: `${colors.accent}20`,
                borderColor: `${colors.accent}45`,
              },
              indicatorStyle,
            ]}
          />
          {TABS.map((item, index) => {
            const active = index === activeIndex;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
                disabled={active}
                onPress={() => selectTab(item.key, index)}
                onPressIn={pressIn}
                onPressOut={pressOut}
                style={styles.navItem}
              >
                <Animated.View style={[styles.navItemContent, pressStyle]}>
                  <View style={styles.navIcon}>
                    <LucideIcon
                      name={item.icon}
                      size={21}
                      color={active ? colors.accent : colors.textMuted}
                      strokeWidth={active ? 2.4 : 2}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[
                      styles.navLabel,
                      {
                        color: active ? colors.accent : colors.textMuted,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {item.label}
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
  app: { flex: 1 },
  screenHost: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingLabel: { fontFamily: 'Nunito', fontSize: 13, marginTop: 14 },
  errorTitle: { fontFamily: 'Nunito', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  errorText: { fontFamily: 'Nunito', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stageText: { fontFamily: 'Nunito', fontSize: 12, marginTop: 10, marginBottom: 20 },
  retryButton: { minHeight: 48, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
  navContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 40,
    elevation: 16,
  },
  navContent: { flex: 1, paddingHorizontal: 8 },
  navIndicator: { position: 'absolute', left: 0, top: 5, borderWidth: 1 },
  navRow: { flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  navItemContent: { width: '100%', height: 62, alignItems: 'center', justifyContent: 'center' },
  navIcon: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontFamily: 'Nunito', fontSize: 10, lineHeight: 13, marginTop: 2 },
});
