import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

const DOT_COUNT = 3;
const BOUNCE = 4;
const DURATION = 320;
const STAGGER = 140;

function useDotAnimations(active: boolean) {
  const dots = useRef(Array.from({ length: DOT_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) {
      dots.forEach((dot) => dot.setValue(0));
      return;
    }

    const loops = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * STAGGER),
          Animated.timing(dot, {
            toValue: 1,
            duration: DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: DURATION,
            useNativeDriver: true,
          }),
          Animated.delay((DOT_COUNT - 1 - index) * STAGGER),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, dots]);

  return dots;
}

type StreamingDotsProps = {
  active: boolean;
  color?: string;
};

export function StreamingDots({ active, color }: StreamingDotsProps) {
  const { colors } = useDashboardTheme();
  const dots = useDotAnimations(active);
  const dotColor = color ?? colors.success;

  return (
    <View style={styles.row} accessibilityLabel="Assistant is typing">
      {dots.map((dot, index) => (
        <Animated.Text
          key={index}
          style={[
            styles.dot,
            { color: dotColor },
            {
              opacity: dot.interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 1],
              }),
              transform: [
                {
                  translateY: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -BOUNCE],
                  }),
                },
              ],
            },
          ]}
        >
          .
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    minHeight: 22,
  },
  dot: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "700",
  },
});
