/// <reference types="astro/client" />

/**
 * Secrets bound at runtime by Cloudflare. Optional because they are absent
 * until configured — `readAuthSecrets` treats missing values as "deny", so
 * the types match the fail-closed behaviour rather than pretending they are
 * always present. See docs/hosting.md for where these are set.
 */
interface Env {
  /** SHA-256 hex digest of the admin console password. */
  CONSOLE_PASSWORD_HASH?: string;
  /** Signing key for the session cookie HMAC. */
  SESSION_SECRET?: string;
}

type CloudflareRuntime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends CloudflareRuntime {}
}
