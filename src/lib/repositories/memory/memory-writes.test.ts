import { describe, expect, it } from 'vitest';
import type { Tenant } from '@/lib/models/tenant';
import { makeTenant } from '@/lib/test-support/fixtures';
import { createMemoryTenantRepository } from './memory-tenant-repository';

/**
 * The in-memory store has to behave the same as the Sheets one, because it is
 * what local dev and most tests run against. A difference here shows up as a
 * bug that only reproduces against the real spreadsheet — the worst place to
 * find one.
 *
 * Every test passes its own array rather than using the module default: the
 * default is a process-lifetime store so a dev session's writes survive
 * between requests, and writing into it from a test would leak into the next.
 */
function repoWith(...tenants: Tenant[]) {
  return createMemoryTenantRepository(tenants);
}

describe('createMemoryTenantRepository writes', () => {
  it('creates with the next id and returns the stored record', async () => {
    const repo = repoWith(makeTenant({ id: 't-001' }));
    const created = await repo.createTenant({
      ...makeTenant({ fullName: 'ใหม่ ตัวอย่าง' }),
    });

    expect(created.id).toBe('t-002');
    expect(created.archived).toBe(false);
    expect((await repo.listTenants()).map((t) => t.id)).toEqual(['t-001', 't-002']);
  });

  it('numbers from the highest existing id, not the record count', async () => {
    const repo = repoWith(makeTenant({ id: 't-012' }), makeTenant({ id: 't-004' }));
    expect((await repo.createTenant(makeTenant())).id).toBe('t-013');
  });

  it('applies only the fields given', async () => {
    const repo = repoWith(makeTenant({ id: 't-001', fullName: 'เดิม', phone: '081' }));
    const updated = await repo.updateTenant('t-001', { phone: '082' });

    expect(updated.phone).toBe('082');
    expect(updated.fullName).toBe('เดิม');
  });

  it('hides an archived record from the list but keeps it reachable by id', async () => {
    const repo = repoWith(makeTenant({ id: 't-001' }), makeTenant({ id: 't-002' }));
    await repo.archiveTenant('t-001');

    expect((await repo.listTenants()).map((t) => t.id)).toEqual(['t-002']);
    expect((await repo.getTenant('t-001'))?.archived).toBe(true);
  });

  it("does not hand an archived record's id to the next one created", async () => {
    const repo = repoWith(makeTenant({ id: 't-001' }), makeTenant({ id: 't-002' }));
    await repo.archiveTenant('t-002');
    expect((await repo.createTenant(makeTenant())).id).toBe('t-003');
  });

  it('names the missing record rather than failing silently', async () => {
    const repo = repoWith(makeTenant({ id: 't-001' }));
    await expect(repo.updateTenant('t-404', { phone: '1' })).rejects.toThrow(
      /No tenant with id "t-404"/,
    );
  });

  /**
   * A shallow copy would hand every caller the same nested address object, so
   * one screen's edit would rewrite the store for every other — the bug the
   * copy-on-read rule exists to prevent, which writes make reachable in a
   * second way.
   */
  it('does not let a caller mutate the store through what it was handed', async () => {
    const repo = repoWith(makeTenant({ id: 't-001' }));

    const created = await repo.createTenant(makeTenant({ fullName: 'ใหม่' }));
    created.address.houseNo = 'MUTATED';
    created.fullName = 'MUTATED';

    const stored = await repo.getTenant(created.id);
    expect(stored?.address.houseNo).not.toBe('MUTATED');
    expect(stored?.fullName).toBe('ใหม่');
  });

  it('does not let a listed record mutate the store either', async () => {
    const repo = repoWith(makeTenant({ id: 't-001', note: 'เดิม' }));
    const [listed] = await repo.listTenants();
    listed!.note = 'MUTATED';

    expect((await repo.getTenant('t-001'))?.note).toBe('เดิม');
  });
});
