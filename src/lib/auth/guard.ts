/** Where an unauthenticated visitor is sent, and the one route left open. */
export const LOGIN_PATH = '/console/login';

const CONSOLE_ROOT = '/console';

/** Trailing slashes are equivalent; '/console/' and '/console' are one route. */
function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * True for routes that require a session.
 *
 * Matches the console root and anything beneath it — but only on a path
 * boundary, so `/console-preview` is a different route and not swept in.
 * The login route itself is exempt, exactly and only at that path.
 */
export function requiresAuth(pathname: string): boolean {
  const path = normalize(pathname);
  if (path !== CONSOLE_ROOT && !path.startsWith(`${CONSOLE_ROOT}/`)) return false;
  return path !== LOGIN_PATH;
}

/** Where login sends you when there is no usable `?next=`. */
export const DEFAULT_LANDING = '/console/rooms';

/**
 * Sanitises the post-login redirect target from `?next=`.
 *
 * Anything that is not a protected console path falls back to the landing
 * page. That is deliberately stricter than "must be relative": it closes the
 * open-redirect hole (`//evil.com` is a protocol-relative URL, not a local
 * path) and stops a redirect loop back to the login page, in one rule.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return DEFAULT_LANDING;
  // Compare on the path alone; a query string is preserved but not trusted.
  const [path] = next.split('?');
  return requiresAuth(path ?? '') ? next : DEFAULT_LANDING;
}
