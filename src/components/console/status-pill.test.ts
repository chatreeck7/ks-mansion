import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import StatusPill from './StatusPill.astro';

describe('StatusPill', () => {
  it('renders its label', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(StatusPill, {
      props: { tone: 'ok', label: 'จ่ายแล้ว' },
    });
    expect(html).toContain('จ่ายแล้ว');
  });

  it('applies the tone colours', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(StatusPill, {
      props: { tone: 'crit', label: 'รอจดมิเตอร์' },
    });
    expect(html).toContain('bg-console-crit-bg');
    expect(html).toContain('text-console-crit');
  });

  it('never uses the gold accent for text', async () => {
    const container = await AstroContainer.create();
    for (const tone of ['ok', 'warn', 'crit', 'info', 'mute'] as const) {
      const html = await container.renderToString(StatusPill, { props: { tone, label: 'x' } });
      expect(html).not.toContain('text-accent');
    }
  });

  it('does not uppercase or wide-track, which degrade Thai', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(StatusPill, {
      props: { tone: 'info', label: 'ว่าง' },
    });
    expect(html).not.toContain('uppercase');
    expect(html).not.toContain('tracking-widest');
  });
});
