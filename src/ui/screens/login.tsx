/**
 * Login / registration screen. Single field, two modes.
 */

import React, { useState, useEffect } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { Card, H1, Button } from '../components';
import { AppContext } from '../app_context';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';

function Muted({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ color: color ?? COLORS.textMuted, fontSize: FONT.small, marginTop: SPACING.sm }}>{children}</Text>;
}

export function LoginScreen({ ctx, onAuthenticated }: { ctx: AppContext; onAuthenticated: () => void }) {
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const reg = await ctx.auth.isRegistered();
      setIsRegistered(reg);
    })();
  }, [ctx.auth]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (!isRegistered) {
        await ctx.auth.register(password);
        onAuthenticated();
      } else {
        const ok = await ctx.auth.signIn(password);
        if (ok) onAuthenticated();
        else setError('Неверный пароль');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (isRegistered === null) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: COLORS.bg, padding: SPACING.lg, justifyContent: 'center' }}
    >
      <H1>Mirai RPG</H1>
      <Muted>{isRegistered ? 'Введи пароль' : 'Придумай пароль (минимум 6 символов)'}</Muted>
      <View style={{ height: SPACING.xl }} />
      <Card>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
          placeholder="••••••"
          placeholderTextColor={COLORS.textDim}
          style={{
            color: COLORS.text,
            fontSize: FONT.h3,
            backgroundColor: COLORS.bg,
            borderRadius: RADIUS.md,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        />
        {error ? <Muted color={COLORS.danger}>{error}</Muted> : null}
        <View style={{ height: SPACING.md }} />
        <Button title={busy ? '...' : isRegistered ? 'Войти' : 'Создать'} onPress={submit} disabled={busy || password.length < 6} />
      </Card>
    </KeyboardAvoidingView>
  );
}
