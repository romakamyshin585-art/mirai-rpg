/**
 * Create-quest sheet.
 *
 * Layout goal (see NIGHT_RUN_REPORT, §3): the whole primary form fits on
 * a standard phone screen with no scrolling. Title is the only free-text
 * field up front; category and difficulty are one-row segmented
 * controls; everything secondary (description, custom XP) lives behind a
 * collapsed "Дополнительно" disclosure. On wide screens the two short
 * controls sit side by side.
 *
 * Save logic is deliberately untouched by the redesign: the sheet closes
 * only after the repository write resolves, and a rejection keeps the
 * form open with the reason shown.
 */

import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES, type Category } from '../domain/category';
import { CATEGORY_LABELS, useTheme } from './theme';
import { LucideIcon } from './components';
import { MotionPressable } from './components/MotionPressable';
import { Overlay } from './components/Overlay';

const DEFAULT_XP: Record<1 | 2 | 3, number> = { 1: 15, 2: 30, 3: 60 };

const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = { 1: 'Легко', 2: 'Средне', 3: 'Сложно' };

const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

const WIDE_LAYOUT_BREAKPOINT = 600;

type QuestDraft = {
  title: string;
  description: string | null;
  category: Category;
  difficulty: 1 | 2 | 3;
  xp_reward: number;
};

export type CreateQuestData = QuestDraft;

export function CreateQuestModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: QuestDraft) => Promise<void>;
}) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_BREAKPOINT;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('health');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [xpText, setXpText] = useState(String(DEFAULT_XP[1]));
  const [extraOpen, setExtraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Fresh form on every open: a half-typed quest must never reappear.
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDescription('');
    setCategory('health');
    setDifficulty(1);
    setXpText(String(DEFAULT_XP[1]));
    setExtraOpen(false);
    setError(null);
    setBusy(false);
  }, [visible]);

  const categoryColor = colors[`cat${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof colors];

  function pickDifficulty(next: 1 | 2 | 3) {
    setDifficulty(next);
    setXpText(String(DEFAULT_XP[next]));
  }

  async function submit() {
    if (busy) return;
    setError(null);
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
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
        title: trimmedTitle,
        description: description.trim() || null,
        category,
        difficulty,
        xp_reward: xp,
      });
      if (!aliveRef.current) return;
      onClose();
    } catch (e: any) {
      if (!aliveRef.current) return;
      console.warn('[MiraiRPG] Create quest failed:', e);
      setError(e?.message ? String(e.message) : 'Не удалось создать квест. Попробуй ещё раз.');
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  const controls = (
    <View style={[styles.controlsRow, wide ? styles.controlsRowWide : null]}>
      <View style={styles.controlBlock}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Ось развития</Text>
        <View style={[styles.segment, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md }]}>
          {CATEGORIES.map(item => {
            const tint = colors[`cat${item.charAt(0).toUpperCase()}${item.slice(1)}` as keyof typeof colors];
            const active = category === item;
            return (
              <MotionPressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={CATEGORY_LABELS[item]}
                onPress={() => setCategory(item)}
                style={[
                  styles.segmentItem,
                  {
                    backgroundColor: active ? `${tint}26` : 'transparent',
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <LucideIcon name={CATEGORY_ICONS[item]} size={17} color={active ? tint : colors.textMuted} />
              </MotionPressable>
            );
          })}
        </View>
        <Text style={[typography.caption, { color: categoryColor, marginTop: 5 }]}>{CATEGORY_LABELS[category]}</Text>
      </View>

      <View style={styles.controlBlock}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Сложность</Text>
        <View style={[styles.segment, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md }]}>
          {([1, 2, 3] as const).map(level => {
            const active = difficulty === level;
            return (
              <MotionPressable
                key={level}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={DIFFICULTY_LABELS[level]}
                onPress={() => pickDifficulty(level)}
                style={[
                  styles.segmentItem,
                  {
                    backgroundColor: active ? `${colors.accent}26` : 'transparent',
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <Text style={[typography.bodyStrong, { color: active ? colors.accent : colors.textMuted }]}>{level}</Text>
              </MotionPressable>
            );
          })}
        </View>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 5 }]}>
          {DIFFICULTY_LABELS[difficulty]} · +{xpText} XP
        </Text>
      </View>
    </View>
  );

  return (
    <Overlay visible={visible} onClose={onClose} align="bottom">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
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
              <Text style={[typography.title, { color: colors.text }]}>Новый квест</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {CATEGORY_LABELS[category]} · {DIFFICULTY_LABELS[difficulty]}
              </Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={onClose}
              disabled={busy}
              style={[styles.headerClose, { backgroundColor: colors.surfaceElevated, opacity: busy ? 0.5 : 1 }]}
            >
              <LucideIcon name="x" size={18} color={colors.textSecondary} />
            </MotionPressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Что сделать? Например: прогулка 30 мин"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.titleInput,
              typography.body,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                borderRadius: radius.md,
                color: colors.text,
              },
            ]}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />

          {controls}

          <MotionPressable
            accessibilityRole="button"
            accessibilityState={{ expanded: extraOpen }}
            onPress={() => setExtraOpen(value => !value)}
            style={styles.disclosure}
          >
            <LucideIcon name={extraOpen ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textMuted} />
            <Text style={[typography.bodyStrong, { color: colors.textSecondary, flex: 1 }]}>Дополнительно</Text>
            {!extraOpen && description.trim() ? (
              <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted, maxWidth: 140 }]}>
                {description.trim()}
              </Text>
            ) : null}
          </MotionPressable>

          {extraOpen ? (
            <View style={styles.extraBlock}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Описание</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Коротко, зачем это нужно"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.extraInput,
                  typography.body,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    borderRadius: radius.md,
                    color: colors.text,
                  },
                ]}
                multiline
                maxLength={240}
              />
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 10 }]}>Своя награда XP</Text>
              <TextInput
                value={xpText}
                onChangeText={setXpText}
                keyboardType="number-pad"
                placeholder={String(DEFAULT_XP[difficulty])}
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.xpInput,
                  typography.numeric,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    borderRadius: radius.md,
                    color: colors.text,
                  },
                ]}
              />
            </View>
          ) : null}

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft, borderRadius: radius.sm }]}>
              <LucideIcon name="circle-alert" size={15} color={colors.danger} />
              <Text style={[typography.caption, { color: colors.danger, flex: 1 }]}>{error}</Text>
            </View>
          ) : null}

          <MotionPressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.submit, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]}
          >
            <LucideIcon name="check" size={18} color={colors.textInverse} strokeWidth={2.6} />
            <Text style={[styles.submitLabel, { color: colors.textInverse }]}>{busy ? 'Сохраняем…' : 'Создать квест'}</Text>
          </MotionPressable>
        </View>
      </KeyboardAvoidingView>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { width: '100%', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerCopy: { flex: 1 },
  headerClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleInput: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, marginBottom: 14 },
  controlsRow: { gap: 12 },
  controlsRowWide: { flexDirection: 'row', gap: 14 },
  controlBlock: { flex: 1 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderWidth: 1, marginTop: 6 },
  segmentItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 42, marginTop: 10 },
  extraBlock: { marginTop: 2 },
  extraInput: { minHeight: 64, paddingHorizontal: 14, paddingTop: 10, borderWidth: 1, marginTop: 6, textAlignVertical: 'top' },
  xpInput: { minHeight: 46, paddingHorizontal: 14, borderWidth: 1, marginTop: 6 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
  submit: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  submitLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
});

export default CreateQuestModal;
