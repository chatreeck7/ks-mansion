import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { CONSOLE_SECTIONS, CONSOLE_TABS, MONTH_STEPS, tabFor } from '@/lib/console-sections';
import ConsoleNav from './ConsoleNav.astro';

describe('CONSOLE_SECTIONS', () => {
  it('lists only sections that exist — no placeholders for unbuilt features', () => {
    // Extend this as each section actually ships. A failure here means either
    // a real section landed (update the list) or a placeholder crept in for
    // something unbuilt (don't).
    expect(CONSOLE_SECTIONS.map((s) => s.id)).toEqual([
      // หน้าสมุด — this month's page (the logbook redesign).
      'home',
      // The month's six steps, in the order they are worked.
      'meter-round',
      'water',
      'bills',
      'payments',
      'collection',
      // KS-27. A real section: /console/documents exists and is reachable.
      'documents',
      // The register.
      'rooms',
      'tenants',
      'health',
    ]);
  });

  it('numbers the month steps 1 to 6', () => {
    expect(MONTH_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('tabFor', () => {
  it('puts every month step under สมุด and the rest under their own tab', () => {
    for (const step of MONTH_STEPS) expect(tabFor(step.id)).toBe('book');
    expect(tabFor('home')).toBe('book');
    expect(tabFor('rooms')).toBe('building');
    expect(tabFor('tenants')).toBe('tenants');
    expect(tabFor('health')).toBe('more');
  });

  it('has exactly four phone tabs', () => {
    expect(CONSOLE_TABS.map((t) => t.label)).toEqual(['สมุด', 'ตึก', 'ผู้เช่า', 'อื่นๆ']);
  });
});

describe('ConsoleNav', () => {
  it('renders every section as a link', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'rooms' },
    });
    expect(html).toContain('console/rooms');
    expect(html).toContain('ห้อง');
  });

  it('marks the active section for assistive tech', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'rooms' },
    });
    expect(html).toContain('aria-current="page"');
  });

  it('renders a desktop rail and a phone bar', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'rooms' },
    });
    expect(html).toContain('data-console-rail');
    expect(html).toContain('data-console-tabbar');
  });

  it('shows a step\'s mark in the spine when the page passes progress', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleNav, {
      props: { activeSection: 'home', progress: { 'meter-round': { mark: 'done' }, payments: { badge: '6/16' } } },
    });
    expect(html).toContain('✓');
    expect(html).toContain('6/16');
  });
});
