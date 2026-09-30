/**
 * Diagnostics sheet.
 *
 * Exists because the failure it is for is unreportable by hand: a blank,
 * unresponsive window with no error message and nothing in memory, where the
 * only evidence is what the app wrote to disk before it stopped. Copying that
 * to the clipboard is one tap and works without a computer, USB debugging or
 * any permission - the user pastes it into a chat and the log arrives intact.
 *
 * Placed on the Achievements tab rather than Home on purpose: the failure this
 * is meant to catch takes Home down, so an entry point inside Home would be
 * unreachable at the moment it is needed.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { Overlay } from './Overlay';
import { grantLogFolder, readDiagnostics, readLogText, shareLog } from '../logging';
import { useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DiagnosticsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function DiagnosticsSheet({ visible, onClose }: DiagnosticsSheetProps) {
  const { colors, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'idle' | 'working' | 'copied' | 'sent' | 'failed' | 'granted'>('idle');
  const [grant, setGrant] = useState<string | null>(null);

  const copy = useCallback(async () => {
    setState('working');
    try {
      // The short log is what usually matters; the full dump goes to the file
      // on request so a paste into a chat stays readable.
      await Clipboard.setStringAsync(readDiagnostics());
      setState('copied');
    } catch {
      setState('failed');
    }
  }, []);

  const send = useCallback(async () => {
    setState('working');
    try {
      const result = await shareLog();
      setState(result.shared ? 'sent' : 'copied');
    } catch {
      setState('failed');
    }
  }, []);

  const allowDownloads = useCallback(async () => {
    setState('working');
    try {
      const result = await grantLogFolder();
      setGrant(result.detail);
      setState(result.ok ? 'granted' : 'copied');
    } catch {
      setState('failed');
    }
  }, []);

  const preview = readLogText().split('\n').slice(-40).join('\n');

  return (
    <Overlay visible={visible} onClose={onClose} align="bottom">
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[typography.title, { color: colors.text }]}>Диагностика</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              Лог пишется на диск постоянно, поэтому переживает зависание. Последние строки
              показывают, на чём приложение остановилось.
            </Text>
          </View>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            style={[styles.close, { backgroundColor: colors.surfaceElevated }]}
          >
            <LucideIcon name="x" size={18} color={colors.textSecondary} />
          </MotionPressable>
        </View>

        <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
          <Text style={[styles.mono, { color: colors.textMuted }]}>{preview}</Text>
        </ScrollView>

        <View style={styles.actions}>
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Разрешить запись лога в Загрузки"
            onPress={() => void allowDownloads()}
            style={[styles.action, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1 }]}
          >
            <Text style={[typography.bodyStrong, { color: colors.text }]}>
              {state === 'granted' ? 'Загрузки разрешены' : 'Разрешить «Загрузки»'}
            </Text>
          </MotionPressable>

          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Отправить лог файлом"
            onPress={() => void send()}
            style={[styles.action, { backgroundColor: colors.accent }]}
          >
            {state === 'working' ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[typography.bodyStrong, { color: colors.textInverse }]}>
                {state === 'sent' ? 'Отправлено' : 'Отправить файлом'}
              </Text>
            )}
          </MotionPressable>

          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Скопировать лог"
            onPress={() => void copy()}
            style={[styles.action, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1 }]}
          >
            <Text style={[typography.bodyStrong, { color: colors.text }]}>В буфер</Text>
          </MotionPressable>
        </View>

        {grant ? (
          <Text style={[styles.foot, { color: colors.textMuted }]} numberOfLines={3}>
            {grant}
          </Text>
        ) : null}

        <Text style={[styles.foot, { color: colors.textMuted }]}>
          Android не даёт писать в «Загрузки» без разрешения — это системное ограничение, а не
          ошибка. Нажмите «Разрешить Загрузки» один раз: приложение спросит папку, и после
          этого лог будет сам сохраняться в mirai-rpg.log.
        </Text>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '82%', borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerCopy: { flex: 1, gap: 4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  preview: { marginTop: 12, marginBottom: 12, maxHeight: 240 },
  previewContent: { padding: 10, borderRadius: 10 },
  mono: { fontFamily: 'monospace', fontSize: 10, lineHeight: 14 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  foot: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 10, paddingHorizontal: 6 },
});

export default DiagnosticsSheet;
