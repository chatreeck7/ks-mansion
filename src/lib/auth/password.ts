/**
 * The admin password is stored as a SHA-256 hex digest in the
 * `CONSOLE_PASSWORD_HASH` secret, never in plaintext — so the stored value is
 * not directly reusable if the secret store is ever read, which matters
 * because admins reuse passwords.
 *
 * SHA-256 is deliberately not a password-stretching KDF (bcrypt/argon2).
 * That is a considered trade-off for this console, not an oversight: there is
 * a single known admin credential, it is never user-chosen at scale, and
 * Workers has no native bcrypt. If this ever grows real user accounts, this
 * is the file to revisit.
 */

const encoder = new TextEncoder();

export async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare without leaking where two strings first differ. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

export async function verifyPassword(input: string, expectedHash: string): Promise<boolean> {
  // An empty submission must never authenticate, whatever is stored — this is
  // the "secret not configured" case, and it should fail closed.
  if (!input) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(await hashPassword(input), expectedHash.toLowerCase());
}
