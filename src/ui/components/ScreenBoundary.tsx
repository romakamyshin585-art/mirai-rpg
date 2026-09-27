/**
 * Per-tab error boundary.
 *
 * The global boundary catches a render error and shows a full-screen
 * fallback — correct, but it loses the whole app for a problem confined to
 * one tab, and its own fallback depends on the theme and motion context,
 * so a failure above that context can leave nothing at all on screen.
 *
 * This one is deliberately dumb: no hooks, no context, no animation. If it
 * ever has to render, it renders plain views and plain text. A tab that
 * fails shows a readable message inside the app chrome, the other tabs keep
 * working, and retrying re-mounts just that tab.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  children: ReactNode;
  /** Shown in the fallback so the user knows which tab failed. */
  label: string;
  onRetry?: () => void;
};

type State = { error: Error | null; generation: number };

export class ScreenBoundary extends Component<Props, State> {
  state: State = { error: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[MiraiRPG] ${this.props.label} failed to render:`, error, info.componentStack);
  }

  private readonly retry = () => {
    this.setState(state => ({ error: null, generation: state.generation + 1 }));
    this.props.onRetry?.();
  };

  render(): ReactNode {
    const { error, generation } = this.state;
    if (!error) return <View key={generation} style={styles.fill}>{this.props.children}</View>;
    return (
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>
          <Text style={styles.title}>Не удалось открыть «{this.props.label}»</Text>
          <Text style={styles.body}>
            Прогресс в безопасности — он сохранён. Остальные вкладки работают как обычно.
          </Text>
          <Text style={styles.detail} numberOfLines={6}>
            {error.message}
          </Text>
          <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}>
            <Text style={styles.buttonText}>Попробовать снова</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#05060A' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  badge: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7F1D1D' },
  badgeText: { fontFamily: 'Nunito', fontSize: 30, fontWeight: '900', color: '#FCA5A5' },
  title: { fontFamily: 'Nunito', fontSize: 19, lineHeight: 25, fontWeight: '800', color: '#E6E8EC', textAlign: 'center' },
  body: { fontFamily: 'Nunito', fontSize: 14, lineHeight: 20, color: '#A0A4AE', textAlign: 'center' },
  detail: { fontFamily: 'Nunito', fontSize: 11, lineHeight: 16, color: '#6B707A', textAlign: 'center' },
  button: { marginTop: 8, minHeight: 48, paddingHorizontal: 24, borderRadius: 14, backgroundColor: '#F5A524', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: '#05060A' },
});

export default ScreenBoundary;
