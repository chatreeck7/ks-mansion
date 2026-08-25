import type { APIRoute } from 'astro';
import { LOGIN_PATH } from '@/lib/auth/guard';
import { SESSION_COOKIE } from '@/middleware';

/**
 * POST-only: a GET logout would let any page log the admin out with an
 * <img> tag, and would be followed by link prefetchers.
 */
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect(LOGIN_PATH, 302);
};
