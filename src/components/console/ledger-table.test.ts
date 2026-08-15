import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { LedgerColumn, LedgerGroup } from '@/lib/models/ledger';
import LedgerTable from './LedgerTable.astro';

const columns: LedgerColumn[] = [
  { key: 'room', header: 'ห้อง' },
  { key: 'rate', header: 'ค่าเช่า', align: 'right' },
  { key: 'status', header: 'สถานะ' },
];

const groups: LedgerGroup[] = [
  {
    label: 'ชั้น 1',
    rows: [
      {
        id: '101',
        href: '/console/rooms/101',
        cells: {
          room: { kind: 'text', value: '101' },
          rate: { kind: 'figure', value: 2600 },
          status: { kind: 'pill', tone: 'info', label: 'ว่าง' },
        },
      },
      {
        id: 'laundry',
        cells: {
          room: { kind: 'text', value: 'ร้านซักผ้า' },
          rate: { kind: 'figure', value: null },
          status: { kind: 'pill', tone: 'mute', label: 'ส่วนกลาง' },
        },
      },
    ],
  },
];

describe('LedgerTable', () => {
  it('renders column headers', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('ห้อง');
    expect(html).toContain('ค่าเช่า');
  });

  it('renders a group header row', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('ชั้น 1');
  });

  it('renders an em dash for a null figure', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('—');
  });

  it('groups thousands in figures', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('2,600');
  });

  it('aligns figures with tabular numerals', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toMatch(/<td[^>]*tabular-nums[^>]*>\s*2,600/);
  });

  it('links a row that has an href', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('href="/console/rooms/101"');
  });

  it('renders a row without an href as plain text', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('ร้านซักผ้า');
    expect(html).not.toMatch(/<a[^>]*>\s*ร้านซักผ้า\s*<\/a>/);
  });

  it('scrolls horizontally rather than breaking the page', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LedgerTable, { props: { columns, groups } });
    expect(html).toContain('overflow-x-auto');
  });

  it('fails loudly when a row is missing a cell for a column', async () => {
    const container = await AstroContainer.create();
    await expect(
      container.renderToString(LedgerTable, {
        props: {
          columns,
          groups: [
            {
              label: 'ชั้น 1',
              rows: [{ id: 'x', cells: { room: { kind: 'text', value: 'x' } } }],
            },
          ],
        },
      })
    ).rejects.toThrow(/no cell for column "rate"/);
  });

  it('fails loudly when href is set but the first column is not a text cell', async () => {
    const container = await AstroContainer.create();
    await expect(
      container.renderToString(LedgerTable, {
        props: {
          columns,
          groups: [
            {
              label: 'ชั้น 1',
              rows: [
                {
                  id: 'y',
                  href: '/console/rooms/y',
                  cells: {
                    room: { kind: 'figure', value: 1 },
                    rate: { kind: 'figure', value: 1 },
                    status: { kind: 'pill', tone: 'info', label: 'x' },
                  },
                },
              ],
            },
          ],
        },
      })
    ).rejects.toThrow(/sets href but its first column \("room"\) is a figure cell/);
  });
});
