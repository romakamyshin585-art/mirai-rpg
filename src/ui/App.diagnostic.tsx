/**
 * Diagnostic minimal boot test.
 * Only React Native View + Text. No SQLite, Fonts, Reanimated, BlurView, etc.
 */

import { View, Text, StyleSheet } from 'react-native';

export default function DiagnosticApp() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        MIRAI BOOT OK
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0F12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 24,
  },
});