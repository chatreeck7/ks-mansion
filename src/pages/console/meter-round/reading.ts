import type { APIRoute } from 'astro';
import { METER_TYPES, type MeterType } from '@/lib/models/meter-reading';
import { getMeterReadingRepository } from '@/lib/repositories';

/**
 * One meter reading, posted as it is entered (KS-72).
 *
 * Per-reading rather than one batch at round close: a round is 27 stops of
 * walking, and batching would put all of them behind a single request made at
 * the moment the person is least able to retry. Posting per stop means a
 * failure surfaces while they are still standing at the meter, and everything
 * already behind them is safe on the sheet.
 *
 * This route checks **shapes** only — that the JSON holds the types it
 * claims. Every domain rule (a reading below its predecessor, a negative
 * rate, a row that would not read back) belongs to the repository and is left
 * there, so the round, this route and the sheet cannot drift into three
 * different opinions about what a valid reading is.
 */

interface ReadingBody {
  roomId: string;
  meterType: MeterType;
  readDateIso: string;
  previousReading: number;
  currentReading: number;
  ratePerUnit: number;
  note: string | null;
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}

function parseBody(value: unknown): ReadingBody | string {
  if (typeof value !== 'object' || value === null) return 'Body must be a JSON object.';
  const body = value as Record<string, unknown>;

  const numbers = ['previousReading', 'currentReading', 'ratePerUnit'] as const;
  for (const field of numbers) {
    if (typeof body[field] !== 'number' || !Number.isFinite(body[field])) {
      return `"${field}" must be a number.`;
    }
  }

  if (typeof body.roomId !== 'string' || body.roomId.trim() === '') {
    return '"roomId" is required.';
  }
  if (!METER_TYPES.includes(body.meterType as MeterType)) {
    return `"meterType" must be one of ${METER_TYPES.join(', ')}.`;
  }
  if (typeof body.readDateIso !== 'string' || Number.isNaN(Date.parse(body.readDateIso))) {
    return '"readDateIso" must be an ISO date.';
  }
  if (body.note !== null && typeof body.note !== 'string') {
    return '"note" must be a string or null.';
  }

  return {
    roomId: body.roomId,
    meterType: body.meterType as MeterType,
    readDateIso: body.readDateIso,
    previousReading: body.previousReading as number,
    currentReading: body.currentReading as number,
    ratePerUnit: body.ratePerUnit as number,
    note: body.note as string | null,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest('Body must be valid JSON.');
  }

  const body = parseBody(payload);
  if (typeof body === 'string') return badRequest(body);

  try {
    const reading = await getMeterReadingRepository(locals.runtime?.env).recordReading({
      roomId: body.roomId,
      meterType: body.meterType,
      readDate: new Date(body.readDateIso),
      previousReading: body.previousReading,
      currentReading: body.currentReading,
      ratePerUnit: body.ratePerUnit,
      note: body.note,
    });

    return new Response(JSON.stringify({ id: reading.id }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (cause) {
    // The repository's message names the row, the column and the reason.
    // The stepper shows it verbatim, because a vaguer restatement is the one
    // thing that would stop someone knowing what to retype.
    return badRequest(cause instanceof Error ? cause.message : String(cause));
  }
};
