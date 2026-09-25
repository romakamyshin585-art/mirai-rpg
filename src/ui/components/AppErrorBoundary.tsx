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
 */

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppContext } from '../app_context';
import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { useTheme } from '../theme';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
  generation: number;
};

function ErrorFallback({ message, onReset }: { message: string; onReset: () => void }) {
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
      <MotionPressable
        accessibilityRole="button"
        onPress={onReset}
        style={[styles.button, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.buttonLabel, { color: colors.textInverse }]}>Вернуться на главную</Text>
      </MotionPressable>
    </View>
  );
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MiraiRPG] Unhandled UI error:', error, info.componentStack);
  }

  private readonly reset = () => {
    // Drop the DB singleton so the fresh mount re-runs migrations and
    // re-reads the user id instead of reusing a half-initialised context.
    AppContext.resetInstance();
    this.setState(state => ({ error: null, generation: state.generation + 1 }));
  };

  render(): ReactNode {
    const { error, generation } = this.state;
    if (error) return <ErrorFallback message={error.message} onReset={this.reset} />;
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
  button: { minHeight: 50, paddingHorizontal: 24, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
});

export default AppErrorBoundary;
