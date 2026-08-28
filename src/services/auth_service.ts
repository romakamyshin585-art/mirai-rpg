/**
 * Local auth (no backend). One user.
 *
 * Password hash is stored in expo-secure-store with an AsyncStorage
 * mirror so we never block indefinitely on Android Keystore races.
 * Every SecureStore call is wrapped in a 3s timeout.
 *
 * bcryptjs (pure JS) is slow on RN, so we use cost 8 (default 10 → 10ms on
 * modern device vs 80ms). For a single-user app this is plenty.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bcrypt from 'bcryptjs';

const PASSWORD_KEY = 'mirai_rpg.password_hash_v1';
const SESSION_KEY = 'mirai_rpg.session_active_v1';
const BCRYPT_COST = 8;
const TIMEOUT_MS = 3000;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`SecureStore timeout: ${label}`)), TIMEOUT_MS),
    ),
  ]);
}

async function ssGet(key: string): Promise<string | null> {
  try {
    return await withTimeout(SecureStore.getItemAsync(key), 'get:' + key);
  } catch (e) {
    console.warn('[MiraiRPG] SecureStore.get failed, fallback to AsyncStorage:', e);
    try { return await AsyncStorage.getItem(key); } catch { return null; }
  }
}

async function ssSet(key: string, value: string): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(key, value), 'set:' + key);
  } catch (e) {
    console.warn('[MiraiRPG] SecureStore.set failed, fallback to AsyncStorage:', e);
  }
  try { await AsyncStorage.setItem(key, value); } catch {}
}

async function ssDel(key: string): Promise<void> {
  try { await withTimeout(SecureStore.deleteItemAsync(key), 'del:' + key); } catch (e) {
    console.warn('[MiraiRPG] SecureStore.del failed:', e);
  }
  try { await AsyncStorage.removeItem(key); } catch {}
}

export class AuthService {
  /** True if user has already created a password (i.e. registered). */
  async isRegistered(): Promise<boolean> {
    const v = await ssGet(PASSWORD_KEY);
    return !!v;
  }

  /** True if currently authenticated in this app run. */
  async isAuthenticated(): Promise<boolean> {
    const v = await ssGet(SESSION_KEY);
    return v === '1';
  }

  /** First-time setup. Hashes the password and stores it. */
  async register(password: string): Promise<void> {
    if (password.length < 6) {
      throw new Error('Пароль должен быть не короче 6 символов');
    }
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await ssSet(PASSWORD_KEY, hash);
    await ssSet(SESSION_KEY, '1');
  }

  /** Verify password and start a session. */
  async signIn(password: string): Promise<boolean> {
    const stored = await ssGet(PASSWORD_KEY);
    if (!stored) return false;
    const ok = await bcrypt.compare(password, stored);
    if (!ok) return false;
    await ssSet(SESSION_KEY, '1');
    return true;
  }

  /** End the current session. Password remains stored. */
  async signOut(): Promise<void> {
    await ssDel(SESSION_KEY);
  }

  /** Nuke everything. For tests. */
  async _resetForTests(): Promise<void> {
    await ssDel(PASSWORD_KEY);
    await ssDel(SESSION_KEY);
  }
}
