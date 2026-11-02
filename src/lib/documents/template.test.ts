import { describe, expect, it } from 'vitest';
import { renderLines, renderTemplate, segmentsToText, unknownPlaceholders } from './template';

describe('renderTemplate', () => {
  it('fills known placeholders and keeps the text around them', () => {
    expect(renderTemplate('ห้อง {ห้อง} ชั้น {ชั้น}', { ห้อง: '202', ชั้น: '2' })).toEqual([
      { kind: 'text', text: 'ห้อง ' },
      { kind: 'value', text: '202' },
      { kind: 'text', text: ' ชั้น ' },
      { kind: 'value', text: '2' },
    ]);
  });

  it('prints a missing value as a writing line, never as nothing', () => {
    const segments = renderTemplate('อายุ {อายุ} ปี', { อายุ: null });
    expect(segments[1]).toEqual({ kind: 'blank', name: 'อายุ' });
    expect(segmentsToText(segments)).toBe('อายุ ………… ปี');
    expect(renderTemplate('{อายุ}', { อายุ: '  ' })[0]).toEqual({ kind: 'blank', name: 'อายุ' });
  });

  it('keeps an unknown placeholder as typed, flagged, rather than dropping it', () => {
    expect(renderTemplate('{ผู้เช่ห}', { ผู้เช่า: 'x' })).toEqual([{ kind: 'unknown', text: '{ผู้เช่ห}' }]);
  });

  it('splits a block into its lines and drops empty ones', () => {
    expect(renderLines('1.1 a\n\n1.2 {x}', { x: 'b' }).map(segmentsToText)).toEqual(['1.1 a', '1.2 b']);
  });

  it('lists the placeholder names an editor should warn about', () => {
    expect(unknownPlaceholders('{ผู้เช่า} {ผู้เช่ห} {ผู้เช่ห}', ['ผู้เช่า'])).toEqual(['ผู้เช่ห']);
  });
});
