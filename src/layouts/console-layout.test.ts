import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ConsoleLayout from './ConsoleLayout.astro';

describe('ConsoleLayout', () => {
  it('sets the page title', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, {
      props: { title: 'ห้อง' },
    });
    expect(html).toContain('<title>ห้อง</title>');
  });

  it('declares Thai as the document language', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, { props: { title: 'ห้อง' } });
    expect(html).toContain('lang="th"');
  });

  it('applies the console ground and font tokens to the body', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, { props: { title: 'ห้อง' } });
    expect(html).toContain('bg-console-paper');
    expect(html).toContain('font-console');
  });

  it('keeps the console out of search results', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConsoleLayout, { props: { title: 'ห้อง' } });
    expect(html).toContain('noindex');
  });
});
