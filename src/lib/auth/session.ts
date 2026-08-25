/**
 * Signed session tokens for the admin console.
 *
 * A token is `<expiry-ms>.<hmac>` — the expiry is readable, but it is signed,
 * so extending it invalidates the signature rather than buying a longer
 * session. There is no server-side session store: the signature *is* the
 * proof. That keeps this working identically in `astro dev` and on Workers
 * without a KV namespace (see wrangler.jsonc for where KV would go if a
 * revocable store is ever wanted).
 *
 * Uses Web Crypto, which both Workers and Node 18+ provide natively — no
 * dependency, and nothing Node-specific that Workers would reject.
 */

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64url(new Uint8Array(signature));
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

export async function createSessionToken(secret: string, expiresAt: number): Promise<string> {
  const expiry = String(Math.floor(expiresAt));
  return `${expiry}.${await sign(secret, expiry)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now: number,
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [expiry, signature] = parts;
  if (!expiry || !signature) return false;
  // Guard before Number(): otherwise '' and whitespace both coerce to 0.
  if (!/^\d+$/.test(expiry)) return false;

  // Signature first, so a forged expiry fails here rather than being trusted.
  if (!timingSafeEqual(signature, await sign(secret, expiry))) return false;

  return Number(expiry) > now;
}
