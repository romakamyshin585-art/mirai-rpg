import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Pressable, Text, ActivityIndicator, StatusBar, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolate, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { MotionPressable } from './components/MotionPressable';
import { OverlayProvider, useOverlayActivity } from './components/Overlay';
import { HAPTIC_EVENTS, duration, scale, spring, useHaptics, usePressAnimation, useReducedMotion } from './motion';

type Tab = 'home' | 'quests' | 'calendar' | 'achievements' | 'profile';

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
};

type CelebrationState = {
  title: string;
  message: string;
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const previousTabRef = useRef<Tab>('home');
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [achievementCelebrationCodes, setAchievementCelebrationCodes] = useState<string[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [initStage, setInitStage] = useState('starting');
  const [retryCount, setRetryCount] = useState(0);
  const { colors } = useTheme();
  const { trigger: triggerHaptic } = useHaptics();
  const [fontsLoaded, fontError] = useNunitoFonts();

  useEffect(() => {
    if (fontsLoaded) console.log('[MiraiRPG] Fonts ready');
    if (fontError) console.warn('[MiraiRPG] Font fallback:', fontError);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    if (!celebration) return;
    const timeout = setTimeout(() => {
      setCelebration(null);
      setAchievementCelebrationCodes([]);
    }, 1800);
    return () => clearTimeout(timeout);
  }, [celebration]);

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

  const changeTab = useCallback((next: Tab) => {
    const previous = previousTabRef.current;
    if (next !== previous) {
      setTransitionDirection(getTabIndex(next) >= getTabIndex(previous) ? 1 : -1);
      previousTabRef.current = next;
      setTab(next);
    }
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
        <MotionPressable
          accessibilityRole="button"
          onPress={() => {
            AppContext.resetInstance();
            setCtx(null);
            setInitError(null);
            setInitStage('starting');
            setRetryCount(value => value + 1);
          }}
          style={[styles.retryButton, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.retryLabel, { color: colors.textInverse }]}>Повторить</Text>
        </MotionPressable>
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
        <ScreenTransition key={tab} tab={tab} direction={transitionDirection}>
          {tab === 'home' ? (
            <HomeScreen ctx={ctx} revision={revision} onOpenQuests={() => changeTab('quests')} />
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
                setAchievementCelebrationCodes(notice.achievementCodes);
                if (notice.leveledUp) {
                  void triggerHaptic(HAPTIC_EVENTS.levelUp);
                  setCelebration({
                    title: `Уровень ${notice.newLevel}`,
                    message: notice.achievementNames.length > 0
                      ? `Новый уровень и достижение: ${notice.achievementNames[0]}`
                      : 'Новый уровень открыт',
                  });
                } else if (notice.achievementNames.length > 0) {
                  void triggerHaptic(HAPTIC_EVENTS.achievementUnlock);
                  setCelebration({
                    title: 'Достижение открыто',
                    message: notice.achievementNames.join(' · '),
                  });
                }
              }}
            />
          ) : tab === 'calendar' ? (
            <CalendarScreen ctx={ctx} revision={revision} onDataChanged={markDataChanged} />
          ) : tab === 'profile' ? (
            <ProfileScreen ctx={ctx} revision={revision} onOpenAchievements={() => changeTab('achievements')} />
          ) : (
            <AchievementsScreen ctx={ctx} revision={revision} celebrationCodes={achievementCelebrationCodes} />
          )}
        </ScreenTransition>
        <BottomTab tab={tab} onChange={changeTab} />
        <Toast
          message={toast?.message ?? null}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction}
          onHide={hideToast}
          bottomOffset={BOTTOM_NAV_BASE_HEIGHT + insets.bottom + 12}
        />
        <CelebrationOverlay
          visible={celebration !== null}
          title={celebration?.title ?? ''}
          message={celebration?.message ?? ''}
        />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.app}>
        <OverlayProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </OverlayProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function getTabIndex(tab: Tab) {
  return TABS.findIndex(item => item.key === tab);
}

function ScreenTransition({
  tab,
  direction,
  children,
}: {
  tab: Tab;
  direction: 1 | -1;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withTiming(1, { duration: duration.major, easing: Easing.out(Easing.cubic) });
  }, [direction, progress, reduced, tab]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ translateX: interpolate(progress.value, [0, 1], [direction * 28, 0], Extrapolate.CLAMP) }],
  }));

  return <Animated.View style={[styles.screen, style]}>{children}</Animated.View>;
}

const TABS: Array<{ key: Tab; icon: string; label: string }> = [
  { key: 'home', icon: 'house', label: 'Главная' },
  { key: 'quests', icon: 'square-check-big', label: 'Квесты' },
  { key: 'calendar', icon: 'calendar-days', label: 'Календарь' },
  { key: 'achievements', icon: 'trophy', label: 'Достижения' },
  { key: 'profile', icon: 'user-round', label: 'Профиль' },
];

function BottomTab({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { trigger } = useHaptics();
  const overlayActive = useOverlayActivity();
  const reduced = useReducedMotion();
  const [navWidth, setNavWidth] = useState(0);
  const indicatorPosition = useSharedValue(0);
  const activeIndex = Math.max(0, getTabIndex(tab));
  const itemWidth = navWidth / TABS.length;

  useEffect(() => {
    if (!itemWidth) return;
    const target = activeIndex * itemWidth;
    indicatorPosition.value = reduced ? target : withSpring(target, spring.navigation);
  }, [activeIndex, indicatorPosition, itemWidth, reduced]);

  const indicatorStyle = useAnimatedStyle(() => ({
    left: reduced ? activeIndex * itemWidth : 0,
    opacity: 1,
    transform: reduced ? [] : [{ translateX: indicatorPosition.value }],
  }));

  const selectTab = (next: Tab) => {
    void trigger(HAPTIC_EVENTS.tabPress);
    onChange(next);
  };

  return (
    <View
      pointerEvents={overlayActive ? 'none' : 'auto'}
      style={[
        styles.navContainer,
        {
          bottom: Math.max(insets.bottom + 6, 12),
          backgroundColor: Platform.OS === 'ios' ? 'rgba(24,27,36,0.5)' : colors.surfaceOverlay,
          borderColor: colors.borderSubtle,
          opacity: overlayActive ? 0 : 1,
        },
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {Platform.OS === 'ios' ? <BlurView style={StyleSheet.absoluteFillObject} intensity={46} tint="dark" /> : null}
      </View>
      <View style={styles.navContent}>
        <View
          onLayout={event => setNavWidth(event.nativeEvent.layout.width)}
          style={styles.navRow}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.navIndicator,
              {
                width: itemWidth,
                backgroundColor: `${colors.accent}18`,
                borderColor: `${colors.accent}66`,
              },
              indicatorStyle,
            ]}
          >
            <View style={[styles.navIndicatorDisc, { backgroundColor: `${colors.accent}26` }]} />
          </Animated.View>
          {TABS.map(item => (
            <BottomTabItem
              key={item.key}
              item={item}
              active={item.key === tab}
              onPress={() => selectTab(item.key)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function BottomTabItem({
  item,
  active,
  onPress,
}: {
  item: { key: Tab; icon: string; label: string };
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const { pressIn, pressOut, pressStyle } = usePressAnimation();
  const activityProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activityProgress.value = reduced
      ? active ? 1 : 0
      : withSpring(active ? 1 : 0, spring.navigation);
  }, [active, activityProgress, reduced]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(activityProgress.value, [0, 1], [0.72, 1], Extrapolate.CLAMP),
    transform: reduced ? [] : [{ scale: interpolate(activityProgress.value, [0, 1], [1, scale.tabActive], Extrapolate.CLAMP) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(activityProgress.value, [0, 1], [colors.textMuted, colors.text]),
    opacity: interpolate(activityProgress.value, [0, 1], [0.78, 1], Extrapolate.CLAMP),
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      disabled={active}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={styles.navItem}
    >
      <Animated.View style={[styles.navItemContent, pressStyle]}>
        <Animated.View style={[styles.navIcon, iconStyle]}>
          <LucideIcon
            name={item.icon}
            size={active ? 22 : 20}
            color={active ? colors.text : colors.textMuted}
            strokeWidth={active ? 2.4 : 2}
          />
        </Animated.View>
        <Animated.Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[styles.navLabel, labelStyle, { fontWeight: active ? '800' : '600' }]}
        >
          {item.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  screen: { flex: 1 },
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
    left: 16,
    right: 16,
    height: BOTTOM_NAV_BASE_HEIGHT,
    borderWidth: 1,
    borderRadius: 32,
    overflow: 'hidden',
    zIndex: 40,
    elevation: 16,
  },
  navContent: { flex: 1, paddingHorizontal: 4 },
  navRow: { flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  navIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  navIndicatorDisc: { width: 48, height: 48, borderRadius: 24 },
  navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  navItemContent: { width: '100%', height: 64, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  navIcon: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  navLabel: { width: '100%', fontFamily: 'Nunito', fontSize: 9.5, lineHeight: 12, textAlign: 'center' },
});
