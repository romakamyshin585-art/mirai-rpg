/**
 * Toast — minimal local notification for newly-unlocked achievements.
 */

import { useEffect, useRef } from 'react';
import { Animated, Text } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from './theme';

export function Toast({ message, onHide }: { message: string | null; onHide: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onHide());
    }, 2500);
    return () => clearTimeout(t);
  }, [message, opacity, onHide]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', bottom: SPACING.xxl, left: SPACING.lg, right: SPACING.lg,
        backgroundColor: COLORS.accent,
        padding: SPACING.md,
        borderRadius: RADIUS.md,
        opacity,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#0E0F12', fontWeight: '700', fontSize: FONT.body }}>{message}</Text>
    </Animated.View>
  );
}
