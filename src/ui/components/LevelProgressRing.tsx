import { StyleSheet, Text, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import { levelProgress } from '../../domain/level';
import { useTheme } from '../theme';

type LevelProgressRingProps = {
  xp: number;
  size?: number;
  strokeWidth?: number;
  showLevel?: boolean;
};

export function LevelProgressRing({ xp, size = 80, strokeWidth = 6, showLevel = true }: LevelProgressRingProps) {
  const { colors, typographyStylesheet } = useTheme();
  const progress = levelProgress(xp);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress.level_progress_pct / 100);

  return (
    <View
      accessible
      accessibilityLabel={`Уровень ${progress.level}, ${progress.level_progress_pct} процентов до следующего`}
      style={[styles.container, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.surfaceFloating}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.content}>
        <Text
          style={[
            typographyStylesheet.numeric,
            { color: showLevel ? colors.text : colors.accent, fontSize: showLevel ? size * 0.25 : size * 0.22 },
          ]}
        >
          {showLevel ? `Lv.${progress.level}` : `${progress.level_progress_pct}%`}
        </Text>
        {showLevel ? (
          <Text style={[typographyStylesheet.caption, { color: colors.textMuted, fontSize: Math.max(9, size * 0.1) }]}>
            {progress.level_progress_pct}%
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute', top: 0, left: 0 },
  content: { alignItems: 'center', justifyContent: 'center' },
});

export default LevelProgressRing;
