/**
 * Local auth (no backend). One user.
 *
 * Password hash is stored in expo-secure-store.
 * We do NOT use JWT/sessions — every action is gated by the
 * in-memory `is_authenticated` flag set by signIn().
 *
 * bcryptjs (pure JS) is slow on RN, so we use cost 8 (default 10 → 10ms on
 * modern device vs 80ms). For a single-user app this is plenty.
 */

import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';

const PASSWORD_KEY = 'mirai_rpg.password_hash_v1';
const SESSION_KEY = 'mirai_rpg.session_active_v1';
const BCRYPT_COST = 8;

export class AuthService {
  /** True if user has already created a password (i.e. registered). */
  async isRegistered(): Promise<boolean> {
    const v = await SecureStore.getItemAsync(PASSWORD_KEY);
    return !!v;
  }

  /** True if currently authenticated in this app run. */
  async isAuthenticated(): Promise<boolean> {
    const v = await SecureStore.getItemAsync(SESSION_KEY);
    return v === '1';
  }

  /** First-time setup. Hashes the password and stores it. */
  async register(password: string): Promise<void> {
    if (password.length < 6) {
      throw new Error('Пароль должен быть не короче 6 символов');
    }
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await SecureStore.setItemAsync(PASSWORD_KEY, hash);
    await SecureStore.setItemAsync(SESSION_KEY, '1');
  }

  /** Verify password and start a session. */
  async signIn(password: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(PASSWORD_KEY);
    if (!stored) return false;
    const ok = await bcrypt.compare(password, stored);
    if (!ok) return false;
    await SecureStore.setItemAsync(SESSION_KEY, '1');
    return true;
  }

  /** End the current session. Password remains stored. */
  async signOut(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  /** Nuke everything. For tests. */
  async _resetForTests(): Promise<void> {
    await SecureStore.deleteItemAsync(PASSWORD_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}
