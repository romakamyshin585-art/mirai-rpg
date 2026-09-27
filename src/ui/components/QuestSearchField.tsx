/**
 * Quest search field.
 *
 * Placement, and why there: the quests screen has a title row, a
 * horizontally scrolling category row, a summary card and then the list.
 * The category row cannot host the field — it scrolls away, and a field
 * that scrolls out of reach is worse than no field. So the search sits
 * between the title and the categories, where it is always one glance
 * away and where the two controls compose: a category narrows the corpus,
 * the query narrows it further, and both are visible at the same time.
 *
 * Motion, all of it on the UI thread:
 *  - the magnifier grows and takes the accent colour on focus, and a soft
 *    accent halo fades in behind the field;
 *  - a one-pixel accent underline wipes in from the left on focus and wipes
 *    out on blur, so the state change is legible without relying on the
 *    border colour alone;
 *  - the clear button scales out rather than disappearing, and the result
 *    count counts up with the shared number component;
 *  - the field is a real `TextInput` with a real label, so TalkBack reads it
 *    as a search field rather than as an unlabelled text box.
 */

import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolate,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { duration, spring, useReducedMotion } from '../motion';

export type QuestSearchFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** Result count rendered at the right; pass 0 to hide the whole cluster. */
  resultCount: number | null;
  placeholder?: string;
};

export function QuestSearchField({
  value,
  onChange,
  resultCount,
  placeholder = 'Найти квест…',
}: QuestSearchFieldProps) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);

  const focus = useSharedValue(0);
  const clearProgress = useSharedValue(0);
  const iconRotate = useSharedValue(0);
  const hasQuery = value.trim().length > 0;

  useEffect(() => {
    if (reduced) {
      focus.value = focused ? 1 : 0;
      return;
    }
    focus.value = withTiming(focused ? 1 : 0, {
      duration: duration.standard,
      easing: Easing.out(Easing.cubic),
    });
    iconRotate.value = withSpring(focused ? -8 : 0, spring.card);
  }, [focus, focused, iconRotate, reduced]);

  useEffect(() => {
    if (reduced) {
      clearProgress.value = hasQuery ? 1 : 0;
      return;
    }
    clearProgress.value = withTiming(hasQuery ? 1 : 0, {
      duration: duration.standard,
      easing: Easing.out(Easing.back(1.6)),
    });
  }, [clearProgress, hasQuery, reduced]);

  // Collapse the halo animation when the screen goes away so the UI thread
  // is not left holding a running animation.
  useEffect(() => () => {
    cancelAnimation(focus);
    cancelAnimation(clearProgress);
    cancelAnimation(iconRotate);
  }, [clearProgress, focus, iconRotate]);

  const shellStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [colors.borderSubtle, `${colors.accent}99`],
    ),
    transform: [{ scale: interpolate(focus.value, [0, 1], [1, 1.012], Extrapolate.CLAMP) }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(focus.value, [0, 1], [0, 0.5], Extrapolate.CLAMP),
    transform: [{ scale: interpolate(focus.value, [0, 1], [0.9, 1], Extrapolate.CLAMP) }],
  }));

  const underlineStyle = useAnimatedStyle(() => ({
    width: `${interpolate(focus.value, [0, 1], [0, 100], Extrapolate.CLAMP)}%`,
    opacity: interpolate(focus.value, [0, 0.6, 1], [0, 1, 0.85], Extrapolate.CLAMP),
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(focus.value, [0, 1], [1, 1.12], Extrapolate.CLAMP) },
      { rotate: `${interpolate(iconRotate.value, [0, -8], [0, 1], Extrapolate.CLAMP)}deg` },
    ],
  }));

  const clearStyle = useAnimatedStyle(() => ({
    opacity: clearProgress.value,
    transform: [{ scale: interpolate(clearProgress.value, [0, 1], [0.5, 1], Extrapolate.CLAMP) }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { backgroundColor: colors.accent }, haloStyle]}
      />
      <Animated.View
        style={[
          styles.shell,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
          },
          shellStyle,
        ]}
      >
        <Animated.View style={iconStyle}>
          <LucideIcon
            name="search"
            size={19}
            color={focused ? colors.accent : colors.textMuted}
            strokeWidth={2.2}
          />
        </Animated.View>

        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          accessibilityLabel="Поиск по квестам"
          accessibilityHint="Введи название или описание квеста"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onChange.bind(null, value.trim())}
          style={[
            styles.input,
            typography.body,
            { color: colors.text },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />

        {resultCount !== null ? (
          <View style={[styles.count, { backgroundColor: colors.surfaceFloating, borderRadius: radius.pill }]}>
            <Text style={[styles.countText, { color: resultCount === 0 ? colors.danger : colors.textMuted }]}>
              {resultCount}
            </Text>
          </View>
        ) : null}

        <Animated.View style={[styles.clearHolder, clearStyle]} pointerEvents={hasQuery ? 'auto' : 'none'}>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            hitSlop={12}
            onPress={() => onChange('')}
            style={[styles.clear, { backgroundColor: colors.surfaceFloating, borderRadius: radius.pill }]}
          >
            <LucideIcon name="x" size={15} color={colors.textSecondary} strokeWidth={2.4} />
          </MotionPressable>
        </Animated.View>

        <Animated.View style={[styles.underline, { backgroundColor: colors.accent }, underlineStyle]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 12, paddingRight: 16 },
  halo: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 12,
    height: 44,
    borderRadius: 16,
    opacity: 0,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 13,
    paddingRight: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 0, fontSize: 15, lineHeight: 20 },
  count: { minWidth: 26, height: 24, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: 'Nunito', fontSize: 12, lineHeight: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clearHolder: { alignItems: 'center', justifyContent: 'center' },
  clear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  underline: { position: 'absolute', left: 0, bottom: 0, height: 1.5 },
});

export default QuestSearchField;
