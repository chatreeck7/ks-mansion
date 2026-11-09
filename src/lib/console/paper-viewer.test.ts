import { describe, expect, it } from 'vitest';
import { paperStylesheet } from './paper';
import { stripPageRules } from './paper-viewer';

describe('paperStylesheet', () => {
  it('fills the running header and keeps the page kinds', () => {
    const css = paperStylesheet('KS MANSION · "รายงาน"');
    expect(css).toContain('content: "KS MANSION ·  รายงาน"');
    expect(css).toContain('@page landscape');
    expect(css).not.toContain('__HEADER__');
  });
});

describe('stripPageRules', () => {
  it('removes @page rules with nested margin boxes and keeps the rest', () => {
    const css = '.a{color:red}@page { size: A4; margin: 0; @top-left { content: "x" } }.b{color:blue}@page named{size:A4}';
    expect(stripPageRules(css)).toBe('.a{color:red}.b{color:blue}');
  });
});
