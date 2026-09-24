import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { duration, spring } from '../motion';
import { useReducedMotion } from '../motion';

type CelebrationOverlayProps = {
  visible: boolean;
  title: string;
  message: string;
};

export function CelebrationOverlay({ visible, title, message }: CelebrationOverlayProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    glow.value = 0;
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion, easing: Easing.out(Easing.cubic) })
      : withSpring(1, spring.celebration);
    glow.value = reduced
      ? withDelay(60, withSequence(withTiming(1, { duration: duration.reducedMotion }), withDelay(220, withTiming(0, { duration: duration.reducedMotion }))))
      : withDelay(60, withSequence(withTiming(1, { duration: duration.micro }), withDelay(220, withTiming(0, { duration: duration.standard, easing: Easing.out(Easing.cubic) }))));
  }, [glow, progress, reduced, visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ scale: 0.88 + progress.value * 0.12 }, { translateY: (1 - progress.value) * 18 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.root}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.card, cardStyle]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 90, elevation: 90 },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(245,165,36,0.18)' },
  card: { minWidth: 220, maxWidth: 320, paddingHorizontal: 24, paddingVertical: 20, borderRadius: 24, backgroundColor: '#1A1C22', borderWidth: 1, borderColor: 'rgba(245,165,36,0.65)', alignItems: 'center' },
  title: { fontFamily: 'Nunito', fontSize: 24, lineHeight: 30, fontWeight: '900', color: '#F5A524', textAlign: 'center' },
  message: { fontFamily: 'Nunito', fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#E6E8EC', textAlign: 'center', marginTop: 5 },
});

export default CelebrationOverlay;
