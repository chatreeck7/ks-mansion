/**
 * Google service-account credential handling.
 *
 * Deliberately no `googleapis` dependency: that package is ~212 MB unpacked,
 * against a Cloudflare Workers limit of 3 MB compressed / 64 MB uncompressed
 * on the free plan — it cannot ship. Even `google-auth-library` (~600 KB) is
 * Node-oriented. Signing a JWT with Web Crypto and calling the REST API with
 * `fetch` needs no dependency at all and is what Workers actually runs.
 */

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

export function parseServiceAccount(raw: string): ServiceAccount {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  if (json.type !== 'service_account') {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON must be a service_account key, got type "${String(json.type)}".`,
    );
  }

  const clientEmail = typeof json.client_email === 'string' ? json.client_email : '';
  if (!clientEmail) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email.');

  const rawKey = typeof json.private_key === 'string' ? json.private_key : '';
  if (!rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing private_key.');

  // Secret fields commonly store the key with literal \n rather than real
  // newlines; the PEM will not decode until those are restored.
  return { clientEmail, privateKey: rawKey.replace(/\\n/g, '\n') };
}

/**
 * Strip PEM armour and decode the base64 body into PKCS#8 bytes.
 *
 * Backed by an explicit ArrayBuffer so the result is `Uint8Array<ArrayBuffer>`
 * rather than `Uint8Array<ArrayBufferLike>` — Web Crypto's `BufferSource`
 * excludes SharedArrayBuffer, and the looser type does not satisfy it.
 */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const match = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!match?.[1]) {
    throw new Error('Service account private_key is not a PKCS#8 PRIVATE KEY PEM block.');
  }
  const body = match[1].replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
