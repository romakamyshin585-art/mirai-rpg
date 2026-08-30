/**
 * Локальная авторизация (без бэкенда). Один пользователь.
 *
 * Пароль хранится в expo-secure-store. Все вызовы обёрнуты в таймаут,
 * чтобы на Android 10+ с глючным Keystore UI не зависало вечно.
 *
 * bcryptjs (pure JS) медленный на RN → cost 8. Для single-user ОК.
 */

import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';

const PASSWORD_KEY = 'mirai_rpg.password_hash_v1';
const SESSION_KEY = 'mirai_rpg.session_active_v1';
const BCRYPT_COST = 8;
const TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('SecureStore timeout: ' + label)), ms),
    ),
  ]);
}

export class AuthService {
  async isRegistered(): Promise<boolean> {
    try {
      const v = await withTimeout(SecureStore.getItemAsync(PASSWORD_KEY), TIMEOUT_MS, 'get-password');
      return !!v;
    } catch {
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const v = await withTimeout(SecureStore.getItemAsync(SESSION_KEY), TIMEOUT_MS, 'get-session');
      return v === '1';
    } catch {
      return false;
    }
  }

  async register(password: string): Promise<void> {
    if (password.length < 6) {
      throw new Error('Пароль должен быть не короче 6 символов');
    }
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await withTimeout(SecureStore.setItemAsync(PASSWORD_KEY, hash), TIMEOUT_MS, 'set-password');
    await withTimeout(SecureStore.setItemAsync(SESSION_KEY, '1'), TIMEOUT_MS, 'set-session');
  }

  async signIn(password: string): Promise<boolean> {
    try {
      const stored = await withTimeout(SecureStore.getItemAsync(PASSWORD_KEY), TIMEOUT_MS, 'get-password');
      if (!stored) return false;
      const ok = await bcrypt.compare(password, stored);
      if (!ok) return false;
      await withTimeout(SecureStore.setItemAsync(SESSION_KEY, '1'), TIMEOUT_MS, 'set-session');
      return true;
    } catch {
      return false;
    }
  }

  async signOut(): Promise<void> {
    try {
      await withTimeout(SecureStore.deleteItemAsync(SESSION_KEY), TIMEOUT_MS, 'del-session');
    } catch {
      // ignore
    }
  }

  async _resetForTests(): Promise<void> {
    try { await withTimeout(SecureStore.deleteItemAsync(PASSWORD_KEY), TIMEOUT_MS, 'del-password'); } catch {}
    try { await withTimeout(SecureStore.deleteItemAsync(SESSION_KEY), TIMEOUT_MS, 'del-session'); } catch {}
  }
}
