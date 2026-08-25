import { defineMiddleware } from 'astro:middleware';
import { LOGIN_PATH, requiresAuth } from '@/lib/auth/guard';
import { readAuthSecrets } from '@/lib/auth/secrets';
import { verifySessionToken } from '@/lib/auth/session';

export const SESSION_COOKIE = 'ks_console_session';

/**
 * The console's security boundary. Runs server-side on every request, which
 * is why KS-57 (SSR) had to land first — on a static host there is no
 * request-time gate, and any check would have shipped the real content to
 * the browser anyway.
 *
 * Fails closed: an unset or malformed secret locks the console rather than
 * opening it.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!requiresAuth(context.url.pathname)) return next();

  const secrets = readAuthSecrets(context.locals.runtime?.env as Record<string, unknown>);
  if (!secrets) {
    return new Response('Console auth is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  const authenticated =
    !!token && (await verifySessionToken(token, secrets.sessionSecret, Date.now()));

  if (!authenticated) {
    // Carry where they were headed, so login returns them there.
    const next_ = context.url.pathname + context.url.search;
    const target = `${LOGIN_PATH}?next=${encodeURIComponent(next_)}`;
    return context.redirect(target, 302);
  }

  return next();
});
