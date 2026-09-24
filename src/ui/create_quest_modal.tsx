/**
 * Create-quest modal. Slides up from bottom, dimmed background, form:
 *   - title (text)
 *   - description (text, optional)
 *   - category (5 pills)
 *   - difficulty (3 pills, auto-sets default XP)
 *   - XP (number, editable, defaults from difficulty)
 *
 * On submit calls quest.create() and closes.
 */

import { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { H2, Muted, Button, Pill, Text } from './components';
import { Overlay } from './components/Overlay';
import { COLORS, CATEGORY_COLORS, CATEGORY_LABELS, FONT, RADIUS, SPACING } from './theme';
import { CATEGORIES, type Category } from '../domain/category';

const DEFAULT_XP: Record<1 | 2 | 3, number> = { 1: 15, 2: 30, 3: 60 };

export function CreateQuestModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description: string | null; category: Category; difficulty: 1 | 2 | 3; xp_reward: number }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('health');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [xpText, setXpText] = useState(String(DEFAULT_XP[1]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickDifficulty(d: 1 | 2 | 3) {
    setDifficulty(d);
    setXpText(String(DEFAULT_XP[d]));
  }

  async function submit() {
    setError(null);
    if (title.trim().length < 3) {
      setError('Название слишком короткое');
      return;
    }
    const xp = parseInt(xpText, 10);
    if (Number.isNaN(xp) || xp < 1 || xp > 500) {
      setError('XP должен быть от 1 до 500');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        category,
        difficulty,
        xp_reward: xp,
      });
      // reset
      setTitle('');
      setDescription('');
      setCategory('health');
      setDifficulty(1);
      setXpText(String(DEFAULT_XP[1]));
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay visible={visible} onClose={onClose} align="bottom">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: '100%', justifyContent: 'flex-end' }}
        pointerEvents="box-none"
      >
        <View style={{ backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, maxHeight: '90%' }}>
            <View style={{ alignItems: 'center', marginBottom: SPACING.md }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <H2>Новый квест</H2>
              <View style={{ height: SPACING.md }} />
              <Muted>Название</Muted>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Например: Прогулка 30 мин"
                placeholderTextColor={COLORS.textDim}
                style={inputStyle}
                autoFocus
              />
              <View style={{ height: SPACING.md }} />
              <Muted>Описание (необязательно)</Muted>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Коротко, зачем"
                placeholderTextColor={COLORS.textDim}
                style={[inputStyle, { height: 60 }]}
                multiline
              />
              <View style={{ height: SPACING.md }} />
              <Muted>Категория</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs }}>
                {CATEGORIES.map((c: Category) => (
                  <Pill
                    key={c}
                    label={CATEGORY_LABELS[c]!}
                    color={category === c ? CATEGORY_COLORS[c] : COLORS.textMuted}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </View>
              <View style={{ height: SPACING.md }} />
              <Muted>Сложность</Muted>
              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs }}>
                {[1, 2, 3].map((d) => {
                  const dd = d as 1 | 2 | 3;
                  return (
                    <Pill
                      key={d}
                      label={`${d}/3`}
                      color={difficulty === dd ? COLORS.accent : COLORS.textMuted}
                      onPress={() => pickDifficulty(dd)}
                    />
                  );
                })}
              </View>
              <View style={{ height: SPACING.md }} />
              <Muted>XP награда</Muted>
              <TextInput
                value={xpText}
                onChangeText={setXpText}
                keyboardType="number-pad"
                style={inputStyle}
              />
              {error ? (
                <View style={{ marginTop: SPACING.sm }}>
                  <Text color={COLORS.danger} size={FONT.small}>{error}</Text>
                </View>
              ) : null}
              <View style={{ height: SPACING.lg }} />
              <Button title={busy ? '...' : 'Создать'} onPress={submit} disabled={busy} />
              <View style={{ height: SPACING.sm }} />
              <Button title="Отмена" onPress={onClose} variant="ghost" />
              <View style={{ height: SPACING.lg }} />
            </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Overlay>
  );
}

const inputStyle = {
  color: COLORS.text,
  fontSize: FONT.body,
  backgroundColor: COLORS.card,
  borderRadius: RADIUS.md,
  padding: SPACING.md,
  borderWidth: 1,
  borderColor: COLORS.border,
  marginTop: SPACING.xs,
} as const;
