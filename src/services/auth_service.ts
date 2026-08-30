/**
 * Single-user app — no auth. Kept as a service so the rest of the
 * codebase that depends on ctx.auth still compiles. All methods are
 * no-ops that resolve successfully. Remove the file once callers
 * stop reaching for ctx.auth.
 */

export class AuthService {
  /** Always true: there is no registration gate. */
  async isRegistered(): Promise<boolean> {
    return true;
  }

  /** Always true: the app is always in the "signed in" state. */
  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  /** Accepted for compatibility; does nothing. */
  async register(_password: string): Promise<void> {
    // no-op
  }

  /** Accepted for compatibility; does nothing. */
  async signIn(_password: string): Promise<boolean> {
    return true;
  }

  /** Accepted for compatibility; does nothing. */
  async signOut(): Promise<void> {
    // no-op
  }

  /** Accepted for compatibility; does nothing. */
  async _resetForTests(): Promise<void> {
    // no-op
  }
}
