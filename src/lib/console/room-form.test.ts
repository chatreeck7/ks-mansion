import { describe, expect, it } from 'vitest';
import { applianceFromForm, applianceToForm, roomEditFromForm } from './room-form';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

describe('applianceFromForm', () => {
  /**
   * Three states, not two. `null` is "nobody has surveyed this room", which is
   * a different fact from "this room has no fridge" — and only one of them
   * belongs on the month-end report.
   */
  it('keeps blank as "not on file" rather than collapsing it to false', () => {
    expect(applianceFromForm('')).toBeNull();
    expect(applianceFromForm('false')).toBe(false);
    expect(applianceFromForm('true')).toBe(true);
  });

  it('round-trips through the form value', () => {
    for (const value of [true, false, null]) {
      expect(applianceFromForm(applianceToForm(value))).toBe(value);
    }
  });
});

describe('roomEditFromForm', () => {
  it('maps every field the form posts', () => {
    const edit = roomEditFromForm(
      formOf({
        label: 'ร้านซักผ้า',
        status: 'noticeGiven',
        rentRate: '1800',
        hasMeter: 'true',
        'appliances.tv': 'false',
        'appliances.fridge': '',
        'appliances.aircon': 'true',
      }),
    );

    expect(edit).toEqual({
      label: 'ร้านซักผ้า',
      status: 'noticeGiven',
      rentRate: 1800,
      hasMeter: true,
      appliances: { tv: false, fridge: null, aircon: true },
    });
  });

  /**
   * Blank means "no rate on record". Coercing it to 0 would assert the space is
   * free, which is a different and wrong claim — see Room.rentRate.
   */
  it('reads a blank rent as null, never as zero', () => {
    expect(roomEditFromForm(formOf({ rentRate: '' })).rentRate).toBeNull();
    expect(roomEditFromForm(formOf({})).rentRate).toBeNull();
    expect(roomEditFromForm(formOf({ rentRate: '0' })).rentRate).toBe(0);
  });

  it('trims, so a stray space does not become part of a label', () => {
    expect(roomEditFromForm(formOf({ label: '  101  ' })).label).toBe('101');
  });

  /** `hasMeter` is deliberately two-state: an unrecorded meter drops a room
   *  out of the meter round, which costs more than an unrecorded fridge. */
  it('treats anything but "true" as no meter', () => {
    expect(roomEditFromForm(formOf({ hasMeter: 'true' })).hasMeter).toBe(true);
    expect(roomEditFromForm(formOf({ hasMeter: 'false' })).hasMeter).toBe(false);
    expect(roomEditFromForm(formOf({})).hasMeter).toBe(false);
  });

  it('carries แจ้งออก through as a status the model already knows', () => {
    expect(roomEditFromForm(formOf({ status: 'noticeGiven' })).status).toBe('noticeGiven');
  });
});
