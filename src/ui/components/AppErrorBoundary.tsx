/**
 * Global Error Boundary.
 *
 * In a release (non-debug) React Native build an uncaught JS error has
 * no red screen: the app just goes black and stops responding. This
 * boundary makes sure that can never be the user-visible outcome — any
 * render/lifecycle error inside the app tree is caught and replaced with
 * a readable fallback plus a "back to home" action that re-mounts the
 * whole app content (and re-initialises the DB singleton) so a single
 * bad screen can never lock the user out of the app.
 *
 * The fallback also reports *where* it broke and *which build* broke. Both
 * are there because a screenshot of this screen is the only evidence a
 * device-only crash ever produces: `error.message` alone ("Rendered more
 * hooks than during the previous render") does not say which component ran
 * out of hooks, and it reads the same on an APK from three versions ago.
 */

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppContext } from '../app_context';
import { APP_VERSION } from '../../app_version';
import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { useTheme } from '../theme';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
  generation: number;
  /** Top frames of the component stack, filled in from componentDidCatch. */
  origin: string;
};

/**
 * The innermost frames first. React prints the component stack leaf-first, so
 * the first non-empty line is the component that actually threw - which is the
 * only line anyone needs to see a hook-order bug.
 */
function topFrames(componentStack: string | null | undefined, count = 3): string {
  if (!componentStack) return '';
  return componentStack
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(' ← ');
}

function ErrorFallback({
  message,
  origin,
  onReset,
}: {
  message: string;
  origin: string;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <LucideIcon name="triangle-alert" size={34} color={colors.danger} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Что-то пошло не так</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Экран не удалось отобразить. Прогресс сохранён — можно вернуться на главную и продолжить.
      </Text>
      {message ? (
        <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={4}>
          {message}
        </Text>
      ) : null}
      {origin ? (
        <Text style={[styles.origin, { color: colors.textMuted }]} numberOfLines={3}>
          Сбой в: {origin}
        </Text>
      ) : null}
      <MotionPressable
        accessibilityRole="button"
        onPress={onReset}
        style={[styles.button, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.buttonLabel, { color: colors.textInverse }]}>Вернуться на главную</Text>
      </MotionPressable>
      <Text style={[styles.version, { color: colors.textMuted }]}>Сборка {APP_VERSION}</Text>
    </View>
  );
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, generation: 0, origin: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MiraiRPG] Unhandled UI error:', error, info.componentStack);
    // Safe here: the boundary is already showing its fallback, so this only
    // refines the text on screen rather than changing what is rendered.
    this.setState({ origin: topFrames(info.componentStack) });
  }

  private readonly reset = () => {
    // Drop the DB singleton so the fresh mount re-runs migrations and
    // re-reads the user id instead of reusing a half-initialised context.
    AppContext.resetInstance();
    this.setState(state => ({ error: null, generation: state.generation + 1, origin: '' }));
  };

  render(): ReactNode {
    const { error, generation, origin } = this.state;
    if (error) return <ErrorFallback message={error.message} origin={origin} onReset={this.reset} />;
    // The key on the Fragment forces a full remount of the subtree on reset.
    return <Fragment key={generation}>{this.props.children}</Fragment>;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Nunito', fontSize: 21, lineHeight: 27, fontWeight: '800', textAlign: 'center' },
  body: { fontFamily: 'Nunito', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  detail: { fontFamily: 'Nunito', fontSize: 11, lineHeight: 16, textAlign: 'center', opacity: 0.75 },
  origin: { fontFamily: 'Nunito', fontSize: 11, lineHeight: 16, textAlign: 'center', opacity: 0.6 },
  button: { minHeight: 50, paddingHorizontal: 24, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
  version: { fontFamily: 'Nunito', fontSize: 10, lineHeight: 14, textAlign: 'center', opacity: 0.45, marginTop: 2 },
});

export default AppErrorBoundary;
