import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
import { padKeyFrom, pressKey, type PadKey } from '@/lib/console/keypad';
import { buttonClass, FOCUS } from '@/lib/console/ui';

/**
 * The meter round, one stop at a time (KS-72), drawn as a line in the
 * logbook with a PIN-style keypad under the thumb.
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
  /**
   * Which figure the keypad is typing into. Almost always the current
   * reading; a stop with nothing on record also needs its previous figure
   * and rate, and each of those is chosen by tapping its line.
   */
  const [target, setTarget] = useState<keyof EntryFields>('currentReading');

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
    setTarget('currentReading');
  }

  function press(key: PadKey) {
    if (busy) return;
    setError(null);
    setFields((f) => ({ ...f, [target]: pressKey(f[target] ?? '', key) }));
  }

  // A keyboard still works — the pad replaces the phone's keyboard, it does
  // not lock out a real one.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = padKeyFrom(event.key);
      if (key) {
        event.preventDefault();
        press(key);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
  const index = round.cursor ?? 0;
  const before = round.stops[index - 1] ?? null;
  const after = round.stops[index + 1] ?? null;
  /** As many boxes as the dial has digits, so a short entry looks short. */
  const width = Math.max(4, (view.previousText ?? '').replace(/[^0-9]/g, '').length);
  const note =
    preview.status === 'invalid'
      ? { text: preview.message, tone: 'text-console-crit' }
      : preview.status === 'ok'
        ? { text: preview.summary, tone: 'text-console-ok' }
        : { text: 'กดตัวเลขตามหน้าปัดมิเตอร์', tone: 'text-console-ink-soft' };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-console-paper font-console text-console-ink">
      <header className="px-4 pt-2">
        <div className="flex items-center justify-between">
          <a
            href={exitHref}
            aria-label="ออกจากรอบจด"
            className={`flex min-h-11 items-center text-base font-medium text-console-ink-soft hover:text-console-ink ${FOCUS}`}
          >
            ✕ พักก่อน
          </a>
          <span className="flex items-center gap-2 text-[15px] font-semibold text-console-ink-soft">
            {bar.passLabel && (
              <span className="rounded-md border-[1.5px] border-dashed border-console-crit bg-console-crit-bg px-2 text-console-crit">
                {bar.passLabel}
              </span>
            )}
            {bar.countText}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-console-sunk">
          <div
            className="h-full rounded-full bg-console-ok transition-all"
            style={{ width: `${Math.round(bar.fraction * 100)}%` }}
          />
        </div>
        <h1 className="mt-2 font-hand text-[21px] font-semibold leading-[1.4]">
          ขั้น 1 · จดมิเตอร์{view.meterLabel}
        </h1>
      </header>

      <form onSubmit={submit} className="flex flex-1 flex-col">
        {/* The page of the logbook: the line before, this line, the next. */}
        <div className="mt-1 border-t border-console-rule bg-[linear-gradient(90deg,transparent_58px,#E7B9B2_58px_59.5px,transparent_59.5px)]">
          {before && (
            <div className="flex h-11 items-center border-b border-console-rule text-base text-console-ink-soft">
              <span className="w-[58px] text-center font-hand font-semibold">{before.roomLabel}</span>
              <span className="pl-3">
                {before.state === 'entered' ? '✓ จดแล้ว' : before.state === 'skipped' ? '○ ข้ามไว้' : ''}
              </span>
            </div>
          )}
          <div className="flex min-h-28 items-center border-b border-console-rule bg-console-highlight/50">
            <div className="w-[58px] flex-none text-center font-hand text-[22px] font-semibold">{view.roomLabel}</div>
            <div className="flex flex-1 flex-col gap-1.5 px-3 py-2">
              <div className="text-base text-console-ink-soft">
                {view.previousText === null ? 'ยังไม่เคยจดจุดนี้' : `ครั้งก่อน ${view.previousText}`}
                {view.rateText && ` · ${view.rateText}`}
              </div>
              <Digits
                value={fields.currentReading}
                width={width}
                active={target === 'currentReading'}
                label="เลขมิเตอร์ตอนนี้"
                onSelect={() => setTarget('currentReading')}
              />
            </div>
          </div>
          {view.needsPreviousReading && (
            <FigureLine
              label="เลขครั้งก่อน"
              value={fields.previousReading ?? ''}
              active={target === 'previousReading'}
              onSelect={() => setTarget('previousReading')}
            />
          )}
          {view.needsRate && (
            <FigureLine
              label="บาท/หน่วย"
              value={fields.ratePerUnit ?? ''}
              active={target === 'ratePerUnit'}
              onSelect={() => setTarget('ratePerUnit')}
            />
          )}
          {after && (
            <div className="flex h-11 items-center border-b border-console-rule text-base text-console-ink-soft">
              <span className="w-[58px] text-center font-hand font-semibold">{after.roomLabel}</span>
              <span className="pl-3">ถัดไป</span>
            </div>
          )}
        </div>

        {view.deferredNote && (
          <p className="mx-4 mt-2 rounded-md bg-console-spine px-3 py-1.5 text-[15px] text-console-ink-soft">
            ข้ามไว้รอบแรก: {view.deferredNote}
          </p>
        )}

        <p aria-live="polite" className={`min-h-[54px] px-4 py-2 text-center text-base font-semibold leading-snug ${note.tone}`}>
          {note.text}
        </p>

        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-lg border-l-4 border-console-crit bg-console-crit-bg px-3 py-2 text-[15px] font-medium text-console-crit">
            {error}
          </p>
        )}

        {/* The thumb zone: the pad, the one action, and the quiet way out. */}
        <div className="sticky bottom-0 mt-auto bg-console-paper px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-1">
          <div className="grid grid-cols-3 gap-[7px]">
            {(['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const).map((key) => (
              <PadButton key={key} onPress={() => press(key)} label={key === '.' ? 'จุดทศนิยม' : key}>
                {key}
              </PadButton>
            ))}
            <PadButton onPress={() => press('back')} label="ลบ" quiet>
              ลบ
            </PadButton>
          </div>
          <button
            type="submit"
            disabled={!ready || busy}
            className={`mt-2 ${buttonClass('primary', 'lg', true)} min-h-[54px] text-[17px]`}
          >
            {busy ? 'กำลังบันทึก…' : 'จดลงสมุด →'}
          </button>
          {skipping ? (
            <div className="mt-2 flex gap-2">
              {['ไม่อยู่', 'ประตูล็อก'].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => skip(reason)}
                  disabled={busy}
                  className={`flex-1 ${buttonClass('secondary', 'md')}`}
                >
                  {reason}
                </button>
              ))}
              <button type="button" onClick={() => skip()} disabled={busy} className={`flex-1 ${buttonClass('secondary', 'md')}`}>
                ข้ามเลย
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSkipping(true)}
              disabled={busy}
              className={`mt-1 ${buttonClass('quiet', 'md', true)} font-medium text-console-ink-soft`}
            >
              ข้ามห้องนี้ไปก่อน
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** The reading as boxes on a ruled line, in Mali, like digits written in by hand. */
function Digits({
  value,
  width,
  active,
  label,
  onSelect,
}: {
  value: string;
  width: number;
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  const chars = value.split('');
  const boxes = Math.max(width, chars.length + (active ? 1 : 0));
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${label}: ${value || 'ยังไม่ได้กด'}`}
      className={`flex gap-1.5 self-start rounded ${FOCUS}`}
    >
      {Array.from({ length: boxes }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-[46px] w-[34px] border-b-[2.5px] text-center font-hand text-[34px] font-semibold leading-[46px] ${
            active && i === chars.length ? 'border-console-crit' : 'border-console-ink'
          }`}
        >
          {chars[i] ?? ''}
        </span>
      ))}
    </button>
  );
}

/** A second figure some stops need: tap the line, then type on the pad. */
function FigureLine({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-12 w-full items-center border-b border-console-rule text-left ${
        active ? 'bg-console-highlight/50' : ''
      } ${FOCUS}`}
    >
      <span className="w-[58px] flex-none" />
      <span className="flex-1 pl-3 text-base text-console-ink-soft">{label}</span>
      <span className="min-w-20 pr-4 text-right font-hand text-2xl font-semibold">{value || '—'}</span>
    </button>
  );
}

function PadButton({
  children,
  onPress,
  label,
  quiet = false,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={`h-[54px] rounded-[10px] border-[1.5px] border-console-ink text-console-ink active:bg-console-highlight ${
        quiet ? 'bg-transparent text-base font-semibold' : 'bg-console-card font-hand text-2xl font-semibold'
      } ${FOCUS}`}
    >
      {children}
    </button>
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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 px-6 text-center font-console text-console-ink">
        <h1 className="font-hand text-2xl font-semibold">ไม่มีจุดให้จด</h1>
        <p className="mb-4 text-base text-console-ink-soft">ยังไม่มีห้องที่ตั้งค่ามิเตอร์ไว้ในทะเบียนห้อง</p>
        <a href={exitHref} className={buttonClass('secondary', 'lg')}>
          กลับหน้าคอนโซล
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8 font-console text-console-ink">
      <span className={`font-hand text-5xl font-semibold ${closed ? 'text-console-ok' : 'text-console-ink'}`} aria-hidden="true">
        {closed ? '✓' : '○'}
      </span>
      <h1 className="mb-1 mt-2 font-hand text-[28px] font-semibold leading-[1.4]">{closed ? 'ปิดรอบแล้ว' : 'จบรอบ'}</h1>
      <p className="mb-6 text-base text-console-ink-soft">
        บันทึกแล้ว {counts.entered} จาก {counts.total} จุด
        {/* Written as they were entered — nothing is waiting to be sent. */}
        <span className="block text-[15px]">ทุกรายการบันทึกลงชีตแล้วระหว่างเดิน</span>
      </p>

      {unread.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-hand text-[17px] font-semibold text-console-crit">ยังไม่ได้จด</h2>
          <ul className="m-0 flex list-none flex-col border-t-2 border-console-ink p-0">
            {unread.map((stop) => (
              <li key={stop.key} className="flex min-h-11 items-center gap-3 border-b border-console-rule text-base">
                <span className="w-12 font-hand font-semibold">{stop.roomLabel}</span>
                <span className="text-console-ink-soft">
                  {stop.meterType === 'water' ? 'น้ำ' : 'ไฟฟ้า'}
                  {stop.note && ` — ${stop.note}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={exitHref}
        className={`mt-auto ${buttonClass('primary', 'lg', true)} min-h-[54px]`}
      >
        เสร็จสิ้น
      </a>
    </div>
  );
}
