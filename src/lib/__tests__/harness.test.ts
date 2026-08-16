import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Probe from '@/lib/__tests__/fixtures/Probe.astro';

describe('test harness', () => {
  it('runs plain TypeScript assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('renders an Astro component to a string', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Probe, { props: { label: 'ok' } });
    expect(html).toContain('data-probe');
    expect(html).toContain('ok');
  });
});
