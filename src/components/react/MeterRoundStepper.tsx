import { useMemo, useState, type FormEvent } from 'react';
import {
  canClose,
  currentStop,
  enterReading,
  progress,
  skipStop,
  type Round,
} from '@/lib/console/meter-round';
import {
  describeProgress,
  describeStop,
  previewEntry,
  type EntryFields,
} from '@/lib/console/meter-round-view';

/**
 * The meter round, one stop at a time (KS-72).
 *
 * Full screen with the console navigation left off the page entirely: this is
 * 27 repetitions done one-handed while walking the building, and chrome in
 * the thumb zone is chrome that eventually taps someone out of the round.
 *
 * All the rules live in `meter-round.ts` and `meter-round-view.ts`. This
 * component decides nothing except what to draw and when to post — which is
 * why the awkward parts (the sweep, the close predicate, the arithmetic) are
 * covered by tests that never render anything.
 */

interface Props {
  initialRound: Round;
  /** ISO date the whole round is recorded under — fixed when it started. */
  readDateIso: string;
  /** Where the ✕ goes: back out of the round, into the ordinary console. */
  exitHref: string;
  postUrl: string;
}

const EMPTY_FIELDS: EntryFields = { currentReading: '', previousReading: '', ratePerUnit: '' };

export default function MeterRoundStepper({
  initialRound,
  readDateIso,
  exitHref,
  postUrl,
}: Props) {
  const [round, setRound] = useState<Round>(initialRound);
  const [fields, setFields] = useState<EntryFields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** True once ข้าม is tapped, while the reason is being chosen. */
  const [skipping, setSkipping] = useState(false);

  const stop = currentStop(round);
  const view = stop ? describeStop(stop) : null;
  const bar = describeProgress(progress(round));
  const preview = useMemo(
    () => (stop ? previewEntry(stop, fields) : { status: 'empty' as const }),
    [stop, fields],
  );

  function advance(next: Round) {
    setRound(next);
    setFields(EMPTY_FIELDS);
    setError(null);
    setSkipping(false);
  }

  /**
   * Readings post as they are entered, not in one batch at the end.
   *
   * A round is 27 stops of walking. Batching would put every one of them
   * behind a single request at the moment the person is least able to retry,
   * and a failure would lose the lot. Posting per stop means a failure is
   * visible while they are still standing at the meter, and the stops already
   * behind them are safe. It is also why nothing here calls `closeRound` to
   * persist: by the time the round closes, everything is already written.
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stop || busy || preview.status !== 'ok') return;

    // Validated by the round itself first, so the rules are stated once. If
    // it refuses, nothing is posted.
    let next: Round;
    try {
      next = enterReading(round, {
        currentReading: Number(fields.currentReading.replace(/,/g, '')),
        ...(preview.status === 'ok' && preview.previousReading !== null
          ? { previousReading: preview.previousReading }
          : {}),
        ...(preview.status === 'ok' && preview.ratePerUnit !== null
          ? { ratePerUnit: preview.ratePerUnit }
          : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    const recorded = next.stops.find((candidate) => candidate.key === stop.key)!;
    setBusy(true);
    try {
      const response = await fetch(postUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId: recorded.roomId,
          meterType: recorded.meterType,
          readDateIso,
          previousReading: recorded.previousReading,
          currentReading: recorded.currentReading,
          ratePerUnit: recorded.ratePerUnit,
          note: recorded.note,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        // The repository's own message names the field and the reason;
        // replacing it with something vaguer would lose the only part that
        // tells someone what to do next.
        setError(body?.message ?? `บันทึกไม่สำเร็จ (${response.status})`);
        return;
      }
    } catch {
      setError('บันทึกไม่สำเร็จ — ตรวจสัญญาณแล้วลองอีกครั้ง');
      return;
    } finally {
      setBusy(false);
    }

    // Only once it is actually written.
    advance(next);
  }

  /**
   * ข้าม writes nothing — a meter that was not read has no reading.
   *
   * The reason is taken as one of two presets rather than free text: by the
   * time เก็บตก comes back round nobody remembers whether this was a locked
   * door or an empty room, and those need different responses. Presets keep
   * it to a single tap with no keyboard, which is the only kind of input
   * this screen can afford.
   */
  function skip(reason?: string) {
    if (!stop || busy) return;
    advance(skipStop(round, reason));
  }

  if (!stop || !view) {
    return <RoundComplete round={round} exitHref={exitHref} closed={canClose(round)} />;
  }

  const ready = preview.status === 'ok';

  return (
    <div className="flex min-h-screen flex-col bg-console-paper">
      <header className="border-b border-console-rule/25 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-console-ink-soft">{bar.countText}</span>
          <div className="flex items-center gap-3">
            {bar.passLabel && (
              <span className="rounded-sm bg-console-warn-bg px-2 py-0.5 text-sm font-semibold text-console-warn">
                {bar.passLabel}
              </span>
            )}
            <a
              href={exitHref}
              aria-label="ออกจากรอบจด"
              className="text-sm text-console-ink-faint hover:text-console-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
            >
              ✕
            </a>
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-console-sunk">
          <div
            className="h-1 rounded-full bg-console-ok transition-all"
            style={{ width: `${Math.round(bar.fraction * 100)}%` }}
          />
        </div>
      </header>

      <form onSubmit={submit} className="flex flex-1 flex-col px-4 pt-8">
        <div className="flex-1">
          <p className="mb-1 text-sm uppercase tracking-widest text-console-ink-faint">
            {view.meterLabel}
          </p>
          <h1 className="mb-2 text-5xl font-semibold leading-none text-console-ink">
            {view.roomLabel}
          </h1>

          <p className="mb-6 text-console-ink-soft">
            {view.previousText === null
              ? 'ยังไม่เคยจดจุดนี้'
              : `ครั้งก่อน ${view.previousText}`}
            {view.rateText && ` · ${view.rateText}`}
          </p>

          {view.deferredNote && (
            <p className="mb-4 rounded-sm bg-console-warn-bg px-3 py-2 text-sm text-console-warn">
              ข้ามไว้: {view.deferredNote}
            </p>
          )}

          {view.needsPreviousReading && (
            <label className="mb-4 block">
              <span className="mb-1 block text-sm text-console-ink-soft">เลขครั้งก่อน</span>
              <input
                type="text"
                inputMode="decimal"
                value={fields.previousReading}
                onChange={(e) => setFields({ ...fields, previousReading: e.target.value })}
                className="w-full rounded-sm border border-console-rule/40 bg-console-card px-3 py-3 text-2xl tabular-nums focus:border-console-rule focus:outline-none"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-console-ink-soft">เลขมิเตอร์ตอนนี้</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              // Large enough to read at arm's length in a stairwell, and to
              // hit without looking.
              className="w-full rounded-sm border border-console-rule/40 bg-console-card px-4 py-5 text-5xl tabular-nums focus:border-console-rule focus:outline-none"
              value={fields.currentReading}
              onChange={(e) => setFields({ ...fields, currentReading: e.target.value })}
            />
          </label>

          {view.needsRate && (
            <label className="mt-4 block">
              <span className="mb-1 block text-sm text-console-ink-soft">บาท/หน่วย</span>
              <input
                type="text"
                inputMode="decimal"
                value={fields.ratePerUnit}
                onChange={(e) => setFields({ ...fields, ratePerUnit: e.target.value })}
                className="w-full rounded-sm border border-console-rule/40 bg-console-card px-3 py-3 text-2xl tabular-nums focus:border-console-rule focus:outline-none"
              />
            </label>
          )}

          <p
            aria-live="polite"
            className={`mt-4 min-h-[1.5rem] text-lg ${
              preview.status === 'invalid' ? 'text-console-crit' : 'text-console-ink-soft'
            }`}
          >
            {preview.status === 'invalid'
              ? preview.message
              : preview.status === 'ok'
                ? preview.summary
                : ''}
          </p>

          {error && (
            <p role="alert" className="mt-2 rounded-sm bg-console-crit-bg px-3 py-2 text-console-crit">
              {error}
            </p>
          )}
        </div>

        {/* The thumb zone: the two actions, and nothing else. */}
        <div className="sticky bottom-0 flex flex-col gap-2 bg-console-paper py-4">
          <button
            type="submit"
            disabled={!ready || busy}
            className="w-full rounded-sm bg-console-ink px-4 py-4 text-lg font-semibold text-console-paper disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-console-rule"
          >
            {busy ? 'กำลังบันทึก…' : 'ถัดไป'}
          </button>
          {/* Quieter than ถัดไป on purpose — skipping is the exception. */}
          {skipping ? (
            <div className="flex gap-2">
              {['ไม่อยู่', 'ประตูล็อก'].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => skip(reason)}
                  disabled={busy}
                  className="flex-1 rounded-sm border border-console-rule/40 px-2 py-3 text-console-ink-soft disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
                >
                  {reason}
                </button>
              ))}
              <button
                type="button"
                onClick={() => skip()}
                disabled={busy}
                className="flex-1 rounded-sm border border-console-rule/40 px-2 py-3 text-console-ink-soft disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
              >
                ข้ามเลย
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSkipping(true)}
              disabled={busy}
              className="w-full px-4 py-3 text-console-ink-soft underline-offset-4 hover:underline disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
            >
              ข้าม
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * The end of the round.
 *
 * There is nothing to commit here — every reading was written as it was
 * entered — so this reports rather than asks. The one number worth showing is
 * how many stops were left unread, because that is what someone has to go
 * back for.
 */
function RoundComplete({
  round,
  exitHref,
  closed,
}: {
  round: Round;
  exitHref: string;
  closed: boolean;
}) {
  const counts = progress(round);
  const unread = round.stops.filter((stop) => stop.state !== 'entered');

  if (counts.total === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="mb-2 text-2xl font-semibold">ไม่มีจุดให้จด</h1>
        <p className="mb-6 text-console-ink-soft">
          ยังไม่มีห้องที่ตั้งค่ามิเตอร์ไว้ในทะเบียนห้อง
        </p>
        <a href={exitHref} className="underline underline-offset-4">
          กลับหน้าคอนโซล
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-10">
      <h1 className="mb-2 text-3xl font-semibold">{closed ? 'ปิดรอบแล้ว' : 'จบรอบ'}</h1>
      <p className="mb-6 text-console-ink-soft">
        บันทึกแล้ว {counts.entered} จาก {counts.total} จุด
        {/* Written as they were entered — nothing is waiting to be sent. */}
        <span className="block text-sm">ทุกรายการบันทึกลงชีตแล้วระหว่างเดิน</span>
      </p>

      {unread.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm uppercase tracking-widest text-console-ink-faint">
            ยังไม่ได้จด
          </h2>
          <ul className="flex flex-col gap-1">
            {unread.map((stop) => (
              <li key={stop.key} className="text-console-ink-soft">
                {stop.roomLabel} · {stop.meterType === 'water' ? 'น้ำ' : 'ไฟฟ้า'}
                {stop.note && ` — ${stop.note}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={exitHref}
        className="mt-auto w-full rounded-sm bg-console-ink px-4 py-4 text-center text-lg font-semibold text-console-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-console-rule"
      >
        เสร็จสิ้น
      </a>
    </div>
  );
}
