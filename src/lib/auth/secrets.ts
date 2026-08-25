export interface AuthSecrets {
  /** SHA-256 hex digest of the admin password. */
  passwordHash: string;
  /** Key the session HMAC is signed with. */
  sessionSecret: string;
}

/** Long enough that guessing the signing key is not the weak link. */
const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Reads the two auth secrets from the Cloudflare runtime env.
 *
 * Returns `null` if either is missing or malformed, and callers must treat
 * that as "deny" — a console with no configured password has to lock, not
 * open. Validating the *shape* here (not just presence) means a plaintext
 * password pasted into the hash field fails at the gate rather than silently
 * never matching.
 */
export function readAuthSecrets(env: Record<string, unknown> | undefined): AuthSecrets | null {
  if (!env) return null;

  const passwordHash = String(env.CONSOLE_PASSWORD_HASH ?? '').trim();
  const sessionSecret = String(env.SESSION_SECRET ?? '').trim();

  if (!/^[0-9a-fA-F]{64}$/.test(passwordHash)) return null;
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) return null;

  return { passwordHash, sessionSecret };
}
