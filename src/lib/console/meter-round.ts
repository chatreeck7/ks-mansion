import type { MeterReading, MeterReadingDraft, MeterType } from '@/lib/models/meter-reading';
import { inWalkingOrder, type Room } from '@/lib/models/room';

/**
 * The state of one walk of the building, reading meters (KS-71).
 *
 * Pure: no repository, no rendering. The stepper (KS-72) draws whatever
 * `currentStop` returns and calls one of the two actions; the repository
 * (KS-18) persists what `closeRound` hands back. Keeping the state machine
 * out of both is what makes the awkward parts — the sweep, the close
 * predicate — testable without a phone or a spreadsheet.
 *
 * **The round is not 27 stops.** A stop is a *meter*, not a room:
 * ร้านซักผ้า carries electricity and water and is visited twice. Every count
 * and every progress indicator here is over stops for that reason, and any
 * caller deriving one from the number of rooms will be wrong by one.
 */

/**
 * unread — not yet offered, or offered and not yet answered.
 * entered — a figure was recorded.
 * skipped — ข้าม. Not the same as resolved; see `isResolved`.
 */
export type StopState = 'unread' | 'entered' | 'skipped';

/** A meter, which is a room *and* which utility — see the note above. */
export interface Meter {
  roomId: string;
  meterType: MeterType;
}

export interface RoundStop extends Meter {
  /** Stable key for the stop, since a room id alone does not identify one. */
  key: string;
  /** What the admin calls the space: '101', 'ร้านซักผ้า'. */
  roomLabel: string;
  /**
   * The dial figure this reading continues from, or null the first time this
   * meter is read at all.
   */
  previousReading: number | null;
  /**
   * The rate this meter was last charged at, offered as a prefill. Null until
   * the meter has been read once. Not a global setting — rooms are ฿6/unit
   * today and the laundry's two meters are not.
   */
  ratePerUnit: number | null;
  state: StopState;
  /** Recorded figure, once entered. */
  currentReading: number | null;
  /** Whoever walked the round, in their own words: a skip reason, a re-read. */
  note: string | null;
  /**
   * True when the ข้าม that left this stop skipped happened during the sweep.
   *
   * This is what separates "come back to it" from "we are not getting this
   * one" without a fourth state: the first ข้าม defers, and the sweep asking
   * again is what turns a deferral into a decision.
   */
  skippedInSweep: boolean;
}

/** Which pass the round is on — what the stepper's header says. */
export type RoundPass = 'first' | 'sweep' | 'complete';

export interface Round {
  stops: RoundStop[];
  /** Position of the stop being offered, or null once nothing is left. */
  cursor: number | null;
  /** False on the way down the list, true once เก็บตก has begun. */
  sweeping: boolean;
}

export interface RoundProgress {
  /** Meters, not rooms. */
  total: number;
  resolved: number;
  entered: number;
  /** Skipped and still owed a second look. */
  deferred: number;
  pass: RoundPass;
}

export interface StopEntry {
  currentReading: number;
  /** Required only where the stop has no previous figure on record. */
  previousReading?: number;
  /** Required only where the stop has no rate on record. */
  ratePerUnit?: number;
  note?: string;
}

function stopKey(meter: Meter): string {
  return `${meter.roomId}:${meter.meterType}`;
}

/** Electricity before water, so a two-meter space is always walked the same way. */
const TYPE_ORDER: readonly MeterType[] = ['electricity', 'water'];

/**
 * Which meters the round visits, from the registry and what has been read
 * before.
 *
 * Two sources, because neither alone is enough. `hasMeter` on the room says
 * every metered space has an electricity sub-meter, which is true and is the
 * only meter fact the rooms tab records. It cannot express ร้านซักผ้า's
 * second meter — so the history supplies that: **a meter that has been read
 * is a meter**, whatever the registry says about it.
 *
 * The consequence worth knowing: a newly installed second meter is invisible
 * here until its first reading exists. That is not a gap to code around — the
 * sheet is admin-editable by design, so the first reading of a new meter is
 * typed into `meter_readings` directly and the round picks it up from there.
 * Encoding a list of known meters in the console instead would be a second
 * registry to keep in step with the sheet.
 *
 * Archived rooms are not walked, and a reading naming a room the registry
 * does not have is ignored — there is no space to stand in front of.
 */
export function metersFrom(rooms: Room[], history: MeterReading[]): Meter[] {
  const seen = new Map<string, Set<MeterType>>();
  for (const reading of history) {
    if (!seen.has(reading.roomId)) seen.set(reading.roomId, new Set());
    seen.get(reading.roomId)!.add(reading.meterType);
  }

  const meters: Meter[] = [];
  for (const room of inWalkingOrder(rooms.filter((r) => !r.archived))) {
    const types = new Set<MeterType>(seen.get(room.id));
    if (room.hasMeter) types.add('electricity');

    for (const meterType of TYPE_ORDER) {
      if (types.has(meterType)) meters.push({ roomId: room.id, meterType });
    }
  }

  return meters;
}

/**
 * The reading a stop continues from: the most recent for that exact meter.
 *
 * Mirrors `MeterReadingRepository.latestReading`, including the same
 * same-date tie-break — the later entry supersedes, because a re-read the
 * same evening is what a correction looks like. Kept here as well so the
 * round can be built from one already-fetched list rather than one repository
 * round trip per stop, which at 28 stops is the difference between a page
 * load and a stall.
 */
function latestFor(history: MeterReading[], meter: Meter): MeterReading | null {
  let latest: MeterReading | null = null;
  for (const reading of history) {
    if (reading.roomId !== meter.roomId || reading.meterType !== meter.meterType) continue;
    if (!latest || reading.readDate.getTime() >= latest.readDate.getTime()) latest = reading;
  }
  return latest;
}

/**
 * A fresh round over the registry.
 *
 * `history` is every reading the console can see — the caller fetches it once
 * and hands it in. Archived readings must already be excluded by the
 * repository's own list, or a withdrawn row could become the figure the next
 * reading continues from.
 */
export function startRound(rooms: Room[], history: MeterReading[]): Round {
  const byId = new Map(rooms.map((room) => [room.id, room]));

  const stops = metersFrom(rooms, history).map((meter): RoundStop => {
    const previous = latestFor(history, meter);
    return {
      ...meter,
      key: stopKey(meter),
      roomLabel: byId.get(meter.roomId)?.label ?? meter.roomId,
      previousReading: previous?.currentReading ?? null,
      ratePerUnit: previous?.ratePerUnit ?? null,
      state: 'unread',
      currentReading: null,
      note: null,
      skippedInSweep: false,
    };
  });

  return { stops, cursor: stops.length > 0 ? 0 : null, sweeping: false };
}

/**
 * Whether this stop still owes the round something.
 *
 * A reading resolves it. So does a second ข้าม — the sweep offered the stop
 * again and was told no again, which is a decision rather than a deferral.
 * One ข้าม on the way down the building resolves nothing, which is the whole
 * point of เก็บตก existing.
 */
export function isResolved(stop: RoundStop): boolean {
  return stop.state === 'entered' || (stop.state === 'skipped' && stop.skippedInSweep);
}

export function currentStop(round: Round): RoundStop | null {
  return round.cursor === null ? null : (round.stops[round.cursor] ?? null);
}

export function progress(round: Round): RoundProgress {
  const resolved = round.stops.filter(isResolved).length;
  return {
    total: round.stops.length,
    resolved,
    entered: round.stops.filter((stop) => stop.state === 'entered').length,
    deferred: round.stops.filter((stop) => !isResolved(stop) && stop.state === 'skipped').length,
    pass: round.cursor === null ? 'complete' : round.sweeping ? 'sweep' : 'first',
  };
}

/** Every stop read or decided — the only state the round may be closed from. */
export function canClose(round: Round): boolean {
  return round.stops.length > 0 && round.stops.every(isResolved);
}

/**
 * Where the round goes after an answer.
 *
 * Down the list once, in walking order, offering every stop including ones
 * already answered out of band. Off the end it turns and sweeps: back to the
 * first stop still unresolved, then the next, until none are left. Because a
 * ข้าม during the sweep resolves the stop, the sweep is a single lap and the
 * round cannot loop.
 */
function advance(round: Round, from: number): Round {
  if (!round.sweeping) {
    const next = from + 1;
    if (next < round.stops.length) return { ...round, cursor: next };

    // Off the end of the first pass. Turn round for whatever was deferred.
    const firstUnresolved = round.stops.findIndex((stop) => !isResolved(stop));
    return firstUnresolved === -1
      ? { ...round, cursor: null, sweeping: true }
      : { ...round, cursor: firstUnresolved, sweeping: true };
  }

  const ahead = round.stops.findIndex((stop, i) => i > from && !isResolved(stop));
  if (ahead !== -1) return { ...round, cursor: ahead };

  // Wrap once, for anything left behind the cursor.
  const behind = round.stops.findIndex((stop) => !isResolved(stop));
  return { ...round, cursor: behind === -1 ? null : behind };
}

function replaceStop(round: Round, index: number, changes: Partial<RoundStop>): Round {
  return {
    ...round,
    stops: round.stops.map((stop, i) => (i === index ? { ...stop, ...changes } : stop)),
  };
}

function requireCursor(round: Round): number {
  if (round.cursor === null) {
    throw new Error('The round has no stop open — every meter is read or decided.');
  }
  return round.cursor;
}

/**
 * Records a figure at the open stop and moves on.
 *
 * The two validations here are the same ones the repository would apply on
 * write, deliberately: a round that only fails at close has already cost
 * someone 28 stops of walking, and the person holding the phone is standing
 * in front of the meter that could settle it.
 */
export function enterReading(round: Round, entry: StopEntry): Round {
  const index = requireCursor(round);
  const stop = round.stops[index]!;
  const where = `${stop.roomLabel} (${stop.meterType})`;

  const previousReading = stop.previousReading ?? entry.previousReading ?? null;
  if (previousReading === null) {
    throw new Error(
      `${where} has never been read, so this entry needs the meter's previous figure too.`,
    );
  }

  const ratePerUnit = entry.ratePerUnit ?? stop.ratePerUnit ?? null;
  if (ratePerUnit === null) {
    throw new Error(`${where} has no rate on record, so this entry needs a บาท/หน่วย rate.`);
  }

  if (entry.currentReading < previousReading) {
    throw new Error(
      `${where}: ${entry.currentReading} is below the previous reading ${previousReading} — ` +
        `a meter does not run backwards.`,
    );
  }

  return advance(
    replaceStop(round, index, {
      state: 'entered',
      currentReading: entry.currentReading,
      previousReading,
      ratePerUnit,
      note: entry.note?.trim() || null,
      // A stop that was deferred and is now read is resolved by the reading;
      // clearing this keeps `skippedInSweep` meaning what it says.
      skippedInSweep: false,
    }),
    index,
  );
}

/**
 * ข้าม. Leaves the stop unresolved on the first pass, and decided on the
 * sweep — see `isResolved`.
 *
 * A note is worth taking on the way past: "ไม่อยู่" and "ประตูล็อก" are
 * different problems, and by the time the sweep comes round nobody remembers
 * which one this was.
 */
export function skipStop(round: Round, note?: string): Round {
  const index = requireCursor(round);

  return advance(
    replaceStop(round, index, {
      state: 'skipped',
      note: note?.trim() || round.stops[index]!.note,
      skippedInSweep: round.sweeping,
    }),
    index,
  );
}

/**
 * The round's output: one draft per stop that was actually read, ready for
 * `MeterReadingRepository.recordReading`.
 *
 * Returns drafts rather than persisting them, which keeps this module pure
 * and leaves the caller holding the decision about partial failure — writing
 * 28 rows to a spreadsheet is 28 chances to stop halfway, and that is the
 * stepper's problem to show, not this module's to hide.
 *
 * Skipped stops produce nothing. A meter that was not read has no reading,
 * and inventing a zero-usage row for it would put a fabricated figure into
 * append-only history that a bill would later be reconstructed from.
 */
export function closeRound(round: Round, readDate: Date): MeterReadingDraft[] {
  if (round.stops.length === 0) {
    throw new Error('The round has no stops — there is no meter to read.');
  }
  if (!canClose(round)) {
    const outstanding = round.stops.filter((stop) => !isResolved(stop));
    throw new Error(
      `The round is not finished: ${outstanding.length} stop(s) still unresolved — ` +
        `${outstanding.map((stop) => stop.roomLabel).join(', ')}.`,
    );
  }

  return round.stops
    .filter((stop) => stop.state === 'entered')
    .map((stop) => ({
      roomId: stop.roomId,
      meterType: stop.meterType,
      readDate,
      previousReading: stop.previousReading!,
      currentReading: stop.currentReading!,
      ratePerUnit: stop.ratePerUnit!,
      note: stop.note,
    }));
}

/**
 * Units at a stop, once it has been read. **Derived, never stored** — the
 * same rule the reading model holds, restated here only because the stepper
 * shows this figure back before anything is persisted.
 */
export function stopUsage(stop: RoundStop): number | null {
  if (stop.currentReading === null || stop.previousReading === null) return null;
  return stop.currentReading - stop.previousReading;
}
