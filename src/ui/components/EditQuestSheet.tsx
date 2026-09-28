/**
 * Edit an existing quest.
 *
 * The design question was "how to let someone fix a typo without turning
 * the editor into a cheat". Three rules, all enforced in the service
 * rather than here, so a second screen cannot get them wrong:
 *
 *  1. **The reward is fixed.** It is decided when the quest is created and
 *     is not an editable field at all - not disabled-looking, simply not
 *     there. Anything editable is eventually editable by a curious finger.
 *  2. **Category and difficulty freeze once the quest has been
 *     completed.** A completion snapshots the axis and the XP it awarded,
 *     so the history and the stat totals stay truthful on their own; moving
 *     the axis afterwards would only make the profile contradict itself.
 *     Title and description stay open, because those are cosmetic.
 *  3. **System quests are not editable.** They are the app's content, and
 *     their titles are the stable key a backup uses to re-attach history
 *     after a reinstall.
 *
 * The rule is shown in the sheet rather than hidden, so the limit reads as
 * a decision instead of a missing control.
 */

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppContext } from '../app_context';
import type { QuestRow } from '../../repos/quest_repo';
import { CATEGORIES, type Category } from '../../domain/category';
import { CATEGORY_LABELS, useTheme } from '../theme';
import { LucideIcon } from '../components';
import { MotionPressable } from './MotionPressable';
import { Overlay } from './Overlay';

const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = { 1: 'Легко', 2: 'Средне', 3: 'Сложно' };
const CATEGORY_ICONS: Record<Category, string> = {
  health: 'heart-pulse',
  knowledge: 'book-open',
  career: 'briefcase-business',
  discipline: 'target',
  social: 'users',
};

export type EditQuestResult = {
  title: string;
  description: string | null;
  category: Category;
  difficulty: 1 | 2 | 3;
};

export function EditQuestSheet({
  ctx,
  questId,
  visible,
  onClose,
  onSaved,
}: {
  ctx: AppContext;
  questId: string | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors, radius, typographyStylesheet: typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetMaxHeight = Math.max(320, Math.min(height * 0.86, height - insets.top - 24));

  const [quest, setQuest] = useState<QuestRow | null>(null);
  const [canChangeShape, setCanChangeShape] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('health');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !questId) return;
    let cancelled = false;
    setError(null);
    setBusy(false);
    void ctx.quest
      .planEdit(questId, ctx.userId)
      .then(plan => {
        if (cancelled) return;
        if (!plan) {
          setError('Этот квест нельзя редактировать');
          return;
        }
        setQuest(plan.quest);
        setCanChangeShape(plan.canChangeShape);
        setCompletionCount(plan.completionCount);
        setTitle(plan.quest.title);
        setDescription(plan.quest.description ?? '');
        setCategory(plan.quest.category);
        setDifficulty(Math.min(3, Math.max(1, plan.quest.difficulty)) as 1 | 2 | 3);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить квест');
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, questId, visible]);

  const submit = async () => {
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setError('Название слишком короткое');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await ctx.quest.applyEdit(questId!, ctx.userId, {
        title: trimmed,
        description: description.trim() || null,
        category,
        difficulty,
      });
      if (!ok) {
        setError('Не удалось сохранить');
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay visible={visible} onClose={busy ? () => undefined : onClose} align="bottom" panTarget="handle">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: radius['2xl'],
              borderTopRightRadius: radius['2xl'],
              paddingBottom: insets.bottom + 16,
              maxHeight: sheetMaxHeight,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={[typography.title, { color: colors.text }]}>Редактировать</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {quest ? quest.title : 'Квест'}
                </Text>
              </View>
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={onClose}
                disabled={busy}
                style={[styles.close, { backgroundColor: colors.surfaceElevated, opacity: busy ? 0.5 : 1 }]}
              >
                <LucideIcon name="x" size={18} color={colors.textSecondary} />
              </MotionPressable>
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Название"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                typography.body,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md, color: colors.text },
              ]}
              maxLength={80}
              accessibilityLabel="Название квеста"
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Описание — что именно сделать"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                styles.multiline,
                typography.body,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md, color: colors.text },
              ]}
              multiline
              maxLength={240}
              accessibilityLabel="Описание квеста"
            />

            {/* The reward. Read-only by construction, and it says why. */}
            <View style={[styles.locked, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md }]}>
              <View style={[styles.lockedIcon, { backgroundColor: `${colors.accent}1A` }]}>
                <LucideIcon name="lock-keyhole" size={16} color={colors.accent} />
              </View>
              <View style={styles.lockedCopy}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>
                  {quest ? `+${quest.xp_reward} XP` : 'Награда'}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  Награда фиксируется при создании и не меняется — иначе правка стала бы способом накрутить опыт.
                </Text>
              </View>
            </View>

            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 6 }]}>Ось развития</Text>
            <View
              style={[
                styles.segment,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md, opacity: canChangeShape ? 1 : 0.45 },
              ]}
            >
              {CATEGORIES.map(item => {
                const tint = colors[`cat${item.charAt(0).toUpperCase()}${item.slice(1)}` as keyof typeof colors];
                const active = category === item;
                return (
                  <MotionPressable
                    key={item}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled: !canChangeShape }}
                    accessibilityLabel={CATEGORY_LABELS[item]}
                    disabled={!canChangeShape}
                    onPress={() => setCategory(item)}
                    style={[
                      styles.segmentItem,
                      { backgroundColor: active ? `${tint}26` : 'transparent', borderRadius: radius.sm },
                    ]}
                  >
                    <LucideIcon name={CATEGORY_ICONS[item]} size={17} color={active ? tint : colors.textMuted} />
                  </MotionPressable>
                );
              })}
            </View>

            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 14, marginBottom: 6 }]}>
              Сложность
            </Text>
            <View
              style={[
                styles.segment,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderRadius: radius.md, opacity: canChangeShape ? 1 : 0.45 },
              ]}
            >
              {([1, 2, 3] as const).map(level => {
                const active = difficulty === level;
                return (
                  <MotionPressable
                    key={level}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled: !canChangeShape }}
                    accessibilityLabel={DIFFICULTY_LABELS[level]}
                    disabled={!canChangeShape}
                    onPress={() => setDifficulty(level)}
                    style={[
                      styles.segmentItem,
                      { backgroundColor: active ? `${colors.accent}26` : 'transparent', borderRadius: radius.sm },
                    ]}
                  >
                    <Text style={[typography.bodyStrong, { color: active ? colors.accent : colors.textMuted }]}>
                      {level}
                    </Text>
                  </MotionPressable>
                );
              })}
            </View>

            {!canChangeShape && completionCount > 0 ? (
              <View style={[styles.note, { backgroundColor: colors.accentSoft, borderColor: `${colors.accent}44` }]}>
                <LucideIcon name="lock-keyhole" size={15} color={colors.accent} />
                <Text style={[typography.caption, { color: colors.accent, flex: 1 }]}>
                  {`Квест уже выполнен ${completionCount} раз, поэтому ось и сложность зафиксированы — иначе история и статистика разошлись бы. Менять можно название и описание.`}
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={[styles.note, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
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
              <Text style={[styles.submitLabel, { color: colors.textInverse }]}>{busy ? 'Сохраняем…' : 'Сохранить'}</Text>
            </MotionPressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', justifyContent: 'flex-end', flexShrink: 1 },
  sheet: { width: '100%', flexShrink: 1, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  body: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  bodyContent: { paddingBottom: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, marginBottom: 10 },
  multiline: { minHeight: 74, paddingTop: 10, textAlignVertical: 'top' },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  lockedIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lockedCopy: { flex: 1, minWidth: 0 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderWidth: 1 },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  submit: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  submitLabel: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800' },
});

export default EditQuestSheet;
