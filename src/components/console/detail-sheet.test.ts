import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DetailSheet from './DetailSheet.astro';
import DetailSection from './DetailSection.astro';

describe('DetailSheet', () => {
  it('renders the title', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, { props: { title: '203' } });
    expect(html).toContain('203');
  });

  it('renders optional meta text', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, {
      props: { title: '203', meta: 'ชั้น 2 · ค่าเช่า 2,800' },
    });
    expect(html).toContain('ชั้น 2 · ค่าเช่า 2,800');
  });

  it('marks the header with the gold rule', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, { props: { title: '203' } });
    expect(html).toContain('border-accent');
  });

  it('does not inherit the marketing base-layer margin on the meta line', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, {
      props: { title: '203', meta: 'ชั้น 2' },
    });
    expect(html).toMatch(/<p[^>]*\bmb-0\b[^>]*>/);
  });

  it('renders no meta element when meta is omitted', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, { props: { title: '203' } });
    expect(html).not.toContain('<p');
  });

  it('renders slotted content', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, {
      props: { title: '203' },
      slots: { default: '<p>สัญญา</p>' },
    });
    expect(html).toContain('สัญญา');
  });

  it('overrides the marketing letter-spacing on the title, which degrades Thai', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSheet, { props: { title: '203' } });
    expect(html).toMatch(/<h1[^>]*\btracking-normal\b[^>]*>/);
  });
});

describe('DetailSection', () => {
  it('renders its heading and content', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSection, {
      props: { heading: 'มิเตอร์ไฟ' },
      slots: { default: '<p>4,182</p>' },
    });
    expect(html).toContain('มิเตอร์ไฟ');
    expect(html).toContain('4,182');
  });

  it('overrides the marketing letter-spacing on the heading, which degrades Thai', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailSection, {
      props: { heading: 'มิเตอร์ไฟ' },
    });
    expect(html).toMatch(/<h2[^>]*\btracking-normal\b[^>]*>/);
  });
});
