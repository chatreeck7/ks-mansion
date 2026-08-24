import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { CONSOLE_SECTIONS } from '@/lib/console-sections';
import ConsoleNav from './ConsoleNav.astro';

describe('CONSOLE_SECTIONS', () => {
  it('lists only sections that exist — no placeholders for unbuilt features', () => {
    expect(CONSOLE_SECTIONS.map((s) => s.id)).toEqual(['rooms']);
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
});
