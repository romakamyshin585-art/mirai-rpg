import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressAnimation } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MotionPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
};

export function MotionPressable({ style, onPressIn, onPressOut, ...props }: MotionPressableProps) {
  const { pressIn, pressOut, pressStyle } = usePressAnimation();

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event: GestureResponderEvent) => {
        pressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        pressOut();
        onPressOut?.(event);
      }}
      style={[style, pressStyle]}
    />
  );
}

export default MotionPressable;
