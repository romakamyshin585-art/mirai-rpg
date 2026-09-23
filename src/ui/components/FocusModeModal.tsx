/**
 * FocusModeModal — Fullscreen modal for focused quest execution.
 * Optimized: removed duplicate useEffect, proper useAnimatedStyle, reduced re-renders.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
  Easing,
  Extrapolate,
  interpolate
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button } from '../components';
import { Text } from 'react-native';
import type { QuestRow } from '../../repos/quest_repo';

interface FocusModeModalProps {
  visible: boolean;
  quest: QuestRow | null;
  onClose: () => void;
  onComplete: (quest: any) => void;
  durationMs?: number;
}

export function FocusModeModal({ visible, quest, onClose, onComplete, durationMs = 30000 }: FocusModeModalProps) {
  const entranceProgress = useSharedValue(0);
  const progressAnim = useSharedValue(0);
  const pulseAnim = useSharedValue(0);

  React.useEffect(() => {
    if (!visible || !quest) return;
    entranceProgress.value = withSpring(1, { damping: 22, stiffness: 180 });
    progressAnim.value = withTiming(1, { duration: durationMs, easing: Easing.linear });
    pulseAnim.value = withSpring(1, { damping: 10, stiffness: 100 });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [visible, quest, durationMs]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value * 0.8,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [{ translateY: interpolate(entranceProgress.value, [0, 1], [50, 0], Extrapolate.CLAMP) }],
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progressAnim.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.05]) }],
    opacity: interpolate(pulseAnim.value, [0, 1], [0.3, 0]),
  }));

  if (!visible || !quest) return null;

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable onPress={onClose} style={styles.overlayTouch}>
        <Animated.View style={[styles.modal, modalStyle]}>
          <Animated.View style={[styles.pulseRing, pulseStyle]} />
          <Animated.View style={[styles.pulseRing, pulseStyle]} />
          
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={16} style={styles.closeButton}>
              <Text style={{ color: '#6B707A', fontSize: 24, fontWeight: '300' }}>×</Text>
            </Pressable>
          </View>

          <View style={styles.questInfo}>
            <View style={[styles.categoryIndicator, { backgroundColor: '#F472B6' }]} />
            <Text style={{ fontFamily: 'Nunito', fontSize: 28, lineHeight: 36, fontWeight: '700', color: '#E6E8EC' }}>{quest.title}</Text>
            {quest.description && <Text style={{ fontFamily: 'Nunito', fontSize: 16, lineHeight: 24, fontWeight: '400', color: '#8A8E99' }}>{quest.description}</Text>}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={{ fontFamily: 'Nunito', fontSize: 12, lineHeight: 16, fontWeight: '400', color: '#6B707A' }}>XP</Text>
                <Text style={{ fontFamily: 'Nunito', fontSize: 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] as any, color: '#F5A524' }}>+{quest.xp_reward}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={{ fontFamily: 'Nunito', fontSize: 12, lineHeight: 16, fontWeight: '400', color: '#6B707A' }}>Сложность</Text>
                <Text style={{ fontFamily: 'Nunito', fontSize: 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] as any, color: '#A0A4AE' }}>{quest.difficulty}/3</Text>
              </View>
            </View>
          </View>

          <View style={styles.progressSection}>
            <Text style={{ fontFamily: 'Nunito', fontSize: 12, lineHeight: 16, fontWeight: '400', color: '#6B707A', marginBottom: 8 }}>Прогресс фокуса</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressBarStyle]} />
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              title="Завершить"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                onComplete(quest);
              }}
            />
            <Button
              title="Отмена"
              onPress={onClose}
              variant="ghost"
            />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  overlayTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1A1C22',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E2128',
    overflow: 'hidden',
    padding: 24,
  },
  pulseRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F5A524',
    opacity: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#23262E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  categoryIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16,
  },
  metaItem: {
    alignItems: 'center',
  },
  progressSection: {
    marginBottom: 24,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1E2128',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '100%',
    backgroundColor: '#F5A524',
    borderRadius: 3,
    transformOrigin: 'left',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});

export default FocusModeModal;