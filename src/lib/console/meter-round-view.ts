import { formatBaht, formatUnits } from '@/lib/format/thai';
import { meterTypeLabel } from '@/lib/models/meter-reading';
import type { RoundProgress, RoundStop } from './meter-round';

/**
 * What one stop of the meter round shows on screen, and what the typed
 * figure means (KS-72).
 *
 * Pure and separate from the component for the usual reason in this
 * codebase: the parsing is the part worth testing, and it is the part that
 * would otherwise sit inline in JSX where no test reaches it. The stepper
 * renders what these return and holds no rules of its own.
 */

export interface StopView {
  roomLabel: string;
  /** ไฟฟ้า or น้ำ — the laundry is two stops and they must not look alike. */
  meterLabel: string;
  /**
   * The figure this reading continues from, ready to print.
   *
   * `null` is the **normal** case on the building's first round, not an edge
   * case: `meter_readings` starts empty, so all 27 stops begin with nothing
   * to continue from and the screen has to ask for it.
   */
  previousText: string | null;
  rateText: string | null;
  /** True when this stop needs the dial's starting figure typed in too. */
  needsPreviousReading: boolean;
  /** True when no rate is on record, so it has to be entered here. */
  needsRate: boolean;
  /** Why it was passed over the first time, shown when the sweep returns. */
  deferredNote: string | null;
}

export function describeStop(stop: RoundStop): StopView {
  return {
    roomLabel: stop.roomLabel,
    meterLabel: meterTypeLabel(stop.meterType),
    previousText: stop.previousReading === null ? null : formatBaht(stop.previousReading),
    rateText: stop.ratePerUnit === null ? null : `${formatBaht(stop.ratePerUnit)} บาท/หน่วย`,
    needsPreviousReading: stop.previousReading === null,
    needsRate: stop.ratePerUnit === null,
    deferredNote: stop.state === 'skipped' ? stop.note : null,
  };
}

export interface ProgressView {
  /** 'จดแล้ว 12 จาก 27 จุด' — จุด (stops), never ห้อง. */
  countText: string;
  /** Set only during เก็บตก, so the second pass is unmistakable. */
  passLabel: string | null;
  /** 0–1, for the bar. */
  fraction: number;
}

export function describeProgress(progress: RoundProgress): ProgressView {
  return {
    // Stops, not rooms. ร้านซักผ้า is two of them, so a count phrased in
    // ห้อง would be short by one and nobody would notice until the bill.
    countText: `จดแล้ว ${progress.resolved} จาก ${progress.total} จุด`,
    passLabel: progress.pass === 'sweep' ? 'เก็บตก' : null,
    fraction: progress.total === 0 ? 0 : progress.resolved / progress.total,
  };
}

/**
 * What the typed figures add up to, recomputed on every keystroke.
 *
 * `invalid` carries the message the field shows. It deliberately repeats the
 * rules `enterReading` enforces rather than trusting the button to be
 * disabled — the preview is what makes a mistyped digit visible *before*
 * anyone commits it, which on a phone in a stairwell is the difference that
 * matters.
 */
export type EntryPreview =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | {
      status: 'ok';
      currentReading: number;
      previousReading: number | null;
      ratePerUnit: number | null;
      /** Null until both dial figures are known. */
      units: number | null;
      charge: number | null;
      summary: string;
    };

export interface EntryFields {
  currentReading: string;
  /** Only asked for when the stop has no previous figure on record. */
  previousReading?: string;
  /** Only asked for when the stop has no rate on record. */
  ratePerUnit?: string;
}

/**
 * A typed figure. Commas are tolerated because a phone keypad and a person
 * copying from paperwork both produce them.
 */
function parseFigure(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function previewEntry(stop: RoundStop, fields: EntryFields): EntryPreview {
  if (fields.currentReading.trim() === '') return { status: 'empty' };

  const currentReading = parseFigure(fields.currentReading);
  if (currentReading === null) {
    return { status: 'invalid', message: 'กรอกเลขมิเตอร์เป็นตัวเลข' };
  }

  const previousReading = stop.previousReading ?? parseFigure(fields.previousReading ?? '');
  if (stop.previousReading === null && previousReading === null) {
    return { status: 'invalid', message: 'จุดนี้ยังไม่เคยจด — กรอกเลขครั้งก่อนด้วย' };
  }

  if (previousReading !== null && currentReading < previousReading) {
    return {
      status: 'invalid',
      // Same rule the repository refuses on write. Said here first, because
      // the person is still standing in front of the meter.
      message: `น้อยกว่าครั้งก่อน (${formatBaht(previousReading)}) — มิเตอร์ไม่เดินถอยหลัง`,
    };
  }

  const ratePerUnit = stop.ratePerUnit ?? parseFigure(fields.ratePerUnit ?? '');
  if (stop.ratePerUnit === null && ratePerUnit === null) {
    return { status: 'invalid', message: 'จุดนี้ยังไม่มีเรตค่าไฟ/ค่าน้ำ — กรอกบาท/หน่วยด้วย' };
  }

  const units = previousReading === null ? null : currentReading - previousReading;
  const charge = units === null || ratePerUnit === null ? null : units * ratePerUnit;

  return {
    status: 'ok',
    currentReading,
    previousReading,
    ratePerUnit,
    units,
    charge,
    summary:
      units === null
        ? ''
        : charge === null
          ? `ใช้ไป ${formatUnits(units)}`
          : `ใช้ไป ${formatUnits(units)} = ${formatBaht(charge)} บาท`,
  };
}
