/**
 * Backup panel.
 *
 * Wraps `services/backup_service`. The screen copy is explicit about the
 * one thing the feature cannot do on its own: Android deletes an app's
 * private directory on uninstall, so "keep my data through a reinstall"
 * is only possible if a copy exists *outside* the app. That is what the
 * export button produces — a small JSON file handed to the system share
 * sheet — and the panel says so rather than promising magic.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import {
  copyBackupToClipboard,
  exportBackup,
  readBackupFile,
  restoreBackup,
  type BackupPayload,
  type BackupSummary,
} from '../../services/backup_service';
import { ConfirmDialog } from './ConfirmDialog';
import { MotionPressable } from './MotionPressable';
import { Overlay } from './Overlay';
import { useTheme } from '../theme';
import { LucideIcon } from '../components';
import { duration, spring, useReducedMotion } from '../motion';

type Props = {
  ctx: AppContext;
  appVersion: string;
  onClose: () => void;
  /** Bumped after a restore so every screen reloads from the new data. */
  onRestored: () => void;
};

export function BackupSheet({ ctx, appVersion, onClose, onRestored }: Props) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState<'export' | 'copy' | 'import' | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupPayload | null>(null);
  const progress = useSharedValue(0);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reduced ? [] : [{ translateY: (1 - progress.value) * 40 }],
  }));

  useEffect(() => {
    progress.value = reduced
      ? withTiming(1, { duration: duration.reducedMotion })
      : withSpring(1, spring.sheet);
  }, [progress, reduced]);

  const doExport = async () => {
    setBusy('export');
    setNotice(null);
    try {
      const result = await exportBackup(ctx.db, ctx.userId, appVersion);
      setSummary(result);
      setNotice({
        tone: 'ok',
        text: `Копия готова: ${result.completions} завершений, ${result.customQuests} своих квестов. Файл ${result.fileName}`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: `Не удалось сохранить копию: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    setBusy('copy');
    setNotice(null);
    try {
      const size = await copyBackupToClipboard(ctx.db, ctx.userId, appVersion);
      setNotice({ tone: 'ok', text: `Копия скопирована в буфер (${Math.round(size / 1024)} КБ). Вставь её в заметку или сообщение себе.` });
    } catch (error) {
      setNotice({ tone: 'error', text: `Не удалось скопировать: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const doPick = async () => {
    setBusy('import');
    setNotice(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const result = await readBackupFile(picked.assets[0].uri);
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.reason });
        return;
      }
      setPendingRestore(result.payload);
    } catch (error) {
      setNotice({ tone: 'error', text: `Не удалось прочитать файл: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    const payload = pendingRestore;
    if (!payload) return;
    setBusy('import');
    try {
      const result = await restoreBackup(ctx.db, payload);
      setPendingRestore(null);
      const orphanNote = result.orphaned > 0 ? `, ${result.orphaned} записей без квеста` : '';
      setNotice({
        tone: 'ok',
        text: `Восстановлено: ${result.completions} завершений${orphanNote}, ${result.unlocks} достижений, ${result.customQuests} своих квестов.`,
      });
      onRestored();
    } catch (error) {
      setNotice({ tone: 'error', text: `Восстановление не удалось: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const tone = notice?.tone === 'error' ? colors.danger : colors.success;
  const toneSoft = notice?.tone === 'error' ? colors.dangerSoft : colors.successSoft;

  return (
    <>
      <Overlay visible onClose={busy ? () => undefined : onClose} align="bottom" panTarget="handle">
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: radius['2xl'],
              borderTopRightRadius: radius['2xl'],
              paddingBottom: insets.bottom + 20,
            },
            sheetStyle,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              <LucideIcon name="hard-drive-download" size={22} color={colors.accent} strokeWidth={2.2} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[typography.title, { color: colors.text }]}>Резервная копия</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Прогресс, история и достижения</Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={[styles.close, { backgroundColor: colors.surfaceElevated }]}
            >
              <LucideIcon name="x" size={19} color={colors.textSecondary} />
            </MotionPressable>
          </View>

          <View style={[styles.notice, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
            <LucideIcon name="info" size={16} color={colors.warning} />
            <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
              Удаление приложения стирает его папку с данными — этого не обойти. Поэтому копия выгружается
              файлом туда, где ты её видишь:{' '}
              {Platform.OS === 'android' ? 'Файлы, Диск, Telegram' : 'Файлы, iCloud'}. Восстановить из неё
              можно в любой момент, даже на другом телефоне.
            </Text>
          </View>

          {notice ? (
            <View style={[styles.result, { backgroundColor: toneSoft, borderColor: tone }]}>
              <LucideIcon name={notice.tone === 'error' ? 'circle-alert' : 'circle-check'} size={17} color={tone} />
              <Text style={[typography.caption, { color: tone, flex: 1 }]}>{notice.text}</Text>
            </View>
          ) : null}

          {summary ? (
            <View style={[styles.statsRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <BackupStat label="Завершений" value={summary.completions} />
              <BackupStat label="Квестов" value={summary.customQuests} />
              <BackupStat label="Достижений" value={summary.unlocks} />
              <BackupStat label="Размер" value={`${Math.max(1, Math.round(summary.bytes / 1024))} КБ`} />
            </View>
          ) : null}

          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Сохранить копию в файл"
            disabled={busy !== null}
            onPress={() => void doExport()}
            style={[styles.action, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]}
          >
            {busy === 'export' ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <>
                <LucideIcon name="share-2" size={18} color={colors.textInverse} strokeWidth={2.4} />
                <Text style={[styles.actionLabel, { color: colors.textInverse }]}>Сохранить копию</Text>
              </>
            )}
          </MotionPressable>

          <View style={styles.secondaryRow}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Скопировать копию в буфер обмена"
              disabled={busy !== null}
              onPress={() => void doCopy()}
              style={[styles.secondary, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]}
            >
              {busy === 'copy' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <LucideIcon name="clipboard-copy" size={16} color={colors.accent} />
                  <Text style={[styles.secondaryLabel, { color: colors.accent }]}>В буфер</Text>
                </>
              )}
            </MotionPressable>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Восстановить из копии"
              disabled={busy !== null}
              onPress={() => void doPick()}
              style={[styles.secondary, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]}
            >
              {busy === 'import' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <LucideIcon name="folder-open" size={16} color={colors.accent} />
                  <Text style={[styles.secondaryLabel, { color: colors.accent }]}>Восстановить</Text>
                </>
              )}
            </MotionPressable>
          </View>

          {Platform.OS === 'android' ? (
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Открыть настройки приложения"
              onPress={openAppSettings}
              style={[styles.miui, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md }]}
            >
              <LucideIcon name="battery-charging" size={16} color={colors.warning} />
              <View style={styles.miuiCopy}>
                <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>Разрешить автозапуск</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
                  MIUI останавливает приложения в фоне. Без этого права фоновая запись данных будет рваться.
                </Text>
              </View>
              <LucideIcon name="chevron-right" size={16} color={colors.textMuted} />
            </MotionPressable>
          ) : null}
        </Animated.View>
      </Overlay>

      <ConfirmDialog
        visible={pendingRestore !== null}
        title="Заменить текущий прогресс?"
        subject={pendingRestore ? `${pendingRestore.completions} завершений из копии` : ''}
        message="Текущая история, свои квесты и достижения будут удалены и заменены содержимым копии. Системные квесты останутся как есть."
        icon="triangle-alert"
        confirmLabel="Восстановить"
        cancelLabel="Отмена"
        onConfirm={() => void doRestore()}
        onCancel={() => setPendingRestore(null)}
      />
    </>
  );
}

function openAppSettings() {
  // MIUI puts "Автозапуск" and the battery optimisation list behind the
  // per-app settings page, which is where this lands. There is no public
  // intent for the autostart screen itself, so the app settings page is the
  // deepest reachable point.
  Linking.openSettings().catch(() => undefined);
}

function BackupStat({ label, value }: { label: string; value: number | string }) {
  const { colors, typographyStylesheet: typography } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[typography.numericSmall, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { width: '100%', borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: 9, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 16 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  statsRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontFamily: 'Nunito', fontSize: 10, lineHeight: 14, marginTop: 2 },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  actionLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
  secondaryRow: { flexDirection: 'row', gap: 9, marginTop: 9 },
  secondary: { flex: 1, minHeight: 46, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryLabel: { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800' },
  miui: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 12, marginTop: 12 },
  miuiCopy: { flex: 1, minWidth: 0 },
});

export default BackupSheet;
