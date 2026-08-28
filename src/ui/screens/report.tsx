/**
 * Экран «Сообщить о баге / дополнить лог».
 */

import { useEffect, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput,
  Pressable, Alert, ActivityIndicator, Share,
} from 'react-native';
import { addUserNote, exportLogsAsFile, log, tailLogs } from '../../services/logger';
import { useAction } from '../../services/action_trace';
import { COLORS, SPACING } from '../theme';

export function ReportScreen({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState('');
  const [tail, setTail] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    log('INFO', 'ReportScreen', 'opened');
    (async () => {
      const t = await tailLogs(300);
      setTail(t);
    })();
  }, []);

  const onSave = useAction('ReportScreen.save', async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      Alert.alert('Пусто', 'Напиши что произошло — хотя бы пару слов.');
      return;
    }
    setBusy(true);
    try {
      addUserNote(trimmed, { tag: 'ReportScreen.user-note' });
      log('INFO', 'ReportScreen', 'user note saved', { len: trimmed.length });
      setNote('');
      const t = await tailLogs(300);
      setTail(t);
      Alert.alert('Сохранено', 'Заметка добавлена в лог.');
    } finally {
      setBusy(false);
    }
  });

  const onExport = useAction('ReportScreen.export', async () => {
    setBusy(true);
    try {
      const file = await exportLogsAsFile();
      log('INFO', 'ReportScreen', 'exported to ' + file);
      try {
        await Share.share({
          url: 'file://' + file,
          message: 'Mirai RPG diagnostic log',
          title: 'Mirai RPG log',
        });
      } catch (e) {
        Alert.alert('Готово', 'Лог сохранён: ' + file);
      }
    } catch (e) {
      log('ERROR', 'ReportScreen', 'export failed: ' + (e as Error).message);
      Alert.alert('Ошибка', String((e as Error).message));
    } finally {
      setBusy(false);
    }
  });

  const lineCount = tail ? tail.split('\n').filter(Boolean).length : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <Pressable onPress={onClose} style={{ paddingVertical: 6, paddingRight: SPACING.md }}>
          <Text style={{ color: COLORS.accent, fontSize: 16 }}>← Назад</Text>
        </Pressable>
        <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '600' }}>Сообщить о баге</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
          Опиши проблему
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder='Например: «Нажал „Завершить квест" — экран завис»'
          placeholderTextColor={COLORS.textMuted}
          multiline
          textAlignVertical="top"
          style={{
            backgroundColor: COLORS.card,
            color: COLORS.text,
            borderRadius: 8,
            padding: 10,
            minHeight: 110,
            fontSize: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: SPACING.md }}>
          <Pressable
            onPress={onSave}
            disabled={busy}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              alignItems: 'center',
              flex: 1,
              backgroundColor: COLORS.accent,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? <ActivityIndicator color={COLORS.bg} /> : <Text style={{ color: COLORS.bg, fontWeight: '700' }}>Сохранить заметку</Text>}
          </Pressable>
          <Pressable
            onPress={onExport}
            disabled={busy}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              alignItems: 'center',
              flex: 1,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: COLORS.accent,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: COLORS.accent, fontWeight: '700' }}>Экспорт лога</Text>
          </Pressable>
        </View>

        <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600', marginTop: SPACING.lg, marginBottom: 6 }}>
          Лог ({lineCount} строк)
        </Text>
        <View style={{ backgroundColor: '#0a0a0a', borderRadius: 6, padding: 8, borderWidth: 1, borderColor: COLORS.border }}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 320 }}>
            <Text style={{ color: '#9cdcfe', fontSize: 10, lineHeight: 14 }}>{tail || '(пока пусто)'}</Text>
          </ScrollView>
        </View>

        <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 8, lineHeight: 15 }}>
          Логи пишутся автоматически: каждое нажатие, изменение экрана, ошибка.
          Файл хранится в приложении и попадает в экспорт. Можно отправить в любой мессенджер.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
