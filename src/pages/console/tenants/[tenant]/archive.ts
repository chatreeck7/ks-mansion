import type { APIRoute } from 'astro';
import { consolePath } from '@/lib/console/paths';
import { getTenantRepository } from '@/lib/repositories';

/**
 * Soft delete, per docs/sheet-schema.md rule 7 — the row stays, an `archived`
 * flag goes on.
 *
 * POST only, and on its own route rather than as a field on the edit form:
 * archiving has to be a deliberate act. A checkbox in a form that also saves
 * a phone number is a checkbox someone eventually ticks by accident, and the
 * tenant disappears from the list with their billing.
 */
export const POST: APIRoute = async ({ params, locals }) => {
  const id = params.tenant!;
  const repository = getTenantRepository(locals.runtime?.env);

  if (!(await repository.getTenant(id))) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }

  await repository.archiveTenant(id);

  // Back to the list, not the detail page: the record is no longer something
  // the list shows, so returning to it would look like the archive failed.
  return new Response(null, {
    status: 303,
    headers: { location: consolePath('console/tenants') },
  });
};
