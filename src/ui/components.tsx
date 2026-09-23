import React from 'react';
import { View, Text as RNText, Pressable, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from './theme';

// Lucide Icons - lazy loaded
const LucideIcons: Record<string, React.ComponentType<any>> = {};
function getLucideIcon(name: string) {
  if (!LucideIcons[name]) {
    try {
      const module = require('lucide-react-native');
      LucideIcons[name] = module[name];
    } catch {
      LucideIcons[name] = () => <View style={{ width: 24, height: 24 }} />;
    }
  }
  return LucideIcons[name];
}

export function LucideIcon({ name, size = 24, color, strokeWidth = 2, style }: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const Icon = getLucideIcon(name);
  return <Icon size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function Row({ children, gap = 0, style, ...props }: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} {...props}>
      {children}
    </View>
  );
}

export function Column({ children, gap = 0, style, ...props }: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'column', gap }, style]} {...props}>
      {children}
    </View>
  );
}

export function Badge({ label, color, style }: { label: string; color: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingVertical: 2, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: color + '20', borderWidth: 1, borderColor: color }, style]}>
      <RNText style={{ color, fontSize: FONT.tiny, fontWeight: '600' }}>{label}</RNText>
    </View>
  );
}

export function ScreenContainer({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style, elevated }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; elevated?: boolean }) {
  return <View style={[styles.card, elevated && styles.cardElevated, style]}>{children}</View>;
}

export function Text({ children, color, size, weight, style }: {
  children: React.ReactNode;
  color?: string;
  size?: number;
  weight?: '400' | '500' | '600' | '700';
  style?: StyleProp<TextStyle>;
}) {
  return (
    <RNText style={[{ color: color ?? COLORS.text, fontSize: size ?? FONT.body, fontWeight: weight ?? '400' }, style]}>
      {children}
    </RNText>
  );
}

export function H1({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text size={FONT.h1} weight="700" color={color ?? COLORS.text} style={style}>{children}</Text>;
}

export function H2({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text size={FONT.h2} weight="600" color={color ?? COLORS.text} style={style}>{children}</Text>;
}

export function H3({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text size={FONT.h3} weight="600" color={color ?? COLORS.text} style={style}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text color={COLORS.textMuted} size={FONT.small}>{children}</Text>;
}

export function Button({ title, onPress, disabled, variant = 'primary' }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
}) {
  const palette =
    variant === 'primary' ? { bg: COLORS.accent, fg: '#0E0F12' } :
    variant === 'danger'  ? { bg: COLORS.danger, fg: '#FFFFFF' } :
                             { bg: 'transparent', fg: COLORS.text };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: COLORS.border },
      ]}
    >
      <RNText style={{ color: palette.fg, fontWeight: '600', fontSize: FONT.body }}>{title}</RNText>
    </Pressable>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color ?? COLORS.accent }]} />
    </View>
  );
}

export function Pill({ label, color, onPress }: { label: string; color: string; onPress?: () => void }) {
  const inner = (
    <View style={[styles.pill, { borderColor: color }]}>
      <RNText style={{ color, fontSize: FONT.tiny, fontWeight: '600' }}>{label}</RNText>
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{inner}</Pressable>;
  }
  return inner;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardElevated: {
    backgroundColor: COLORS.cardElevated,
    borderCurve: 'continuous',
  },
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.pill,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: RADIUS.pill,
    borderCurve: 'continuous',
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
