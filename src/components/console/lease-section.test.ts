import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { makeLease } from '@/lib/test-support/fixtures';
import LeaseSection from './LeaseSection.astro';

const BASE_PROPS = {
  counterpartLabel: 'ผู้เช่า',
  counterpartFor: () => 'สมชาย ตัวอย่าง',
  emptyMessage: 'ยังไม่มีสัญญาเช่าสำหรับห้องนี้',
  now: new Date(2026, 5, 1),
};

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(LeaseSection, { props: { ...BASE_PROPS, ...props } });
}

describe('LeaseSection', () => {
  it('shows the empty message rather than a bare heading when there is no lease', async () => {
    const html = await render({ leases: [] });
    expect(html).toContain('ยังไม่มีสัญญาเช่าสำหรับห้องนี้');
  });

  it('shows the occupant count, which is what ค่าน้ำ is charged against', async () => {
    const html = await render({ leases: [makeLease({ occupantCount: 3 })] });
    expect(html).toContain('จำนวนผู้พัก');
    expect(html).toContain('3');
  });

  // ค่าน้ำ is occupants × 100 for a home but metered for ร้านซักผ้า, and
  // nothing in the model marks which is which yet. Printing the derived
  // figure here would quietly show the wrong one for the shop, so the screen
  // shows the headcount and leaves the charge to billing.
  it('does not print a derived water charge next to the headcount', async () => {
    const html = await render({ leases: [makeLease({ occupantCount: 3 })] });
    expect(html).not.toContain('ค่าน้ำ');
  });

  it('flags a tenancy that ended with the tenant absconding', async () => {
    const html = await render({
      leases: [makeLease({ endDate: new Date(2025, 11, 31), endReason: 'absconded' })],
    });
    expect(html).toContain('หนี');
  });

  // A tenancy that simply ran its course needs no flag — badging every
  // finished lease would bury the one that matters.
  it('does not flag a tenancy that ended normally', async () => {
    const html = await render({
      leases: [makeLease({ endDate: new Date(2025, 11, 31), endReason: 'normal' })],
    });
    expect(html).not.toContain('สิ้นสุดตามปกติ');
    expect(html).not.toContain('หนี');
  });

  it('marks the lease in force on the given day as current', async () => {
    const html = await render({ leases: [makeLease({ endDate: null })] });
    expect(html).toContain('ปัจจุบัน');
  });
});
