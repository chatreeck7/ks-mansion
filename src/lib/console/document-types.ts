import { consolePath } from '@/lib/console/paths';
import { cycleLabel, type BillingCycle } from '@/lib/models/billing-cycle';

/**
 * The document type registry (KS-27, AC-4.1).
 *
 * **One place that says what documents this console can produce**, what each
 * is called in the family's own words, and — for the ones it cannot produce
 * yet — why not. AC-4.1 names five document types by name; two of them exist
 * today, and the card is a *registry* precisely because the other three
 * arrive later and must slot in without the selector being rewritten.
 *
 * **Unbuilt types are listed, not hidden.** A selector showing two entries
 * looks finished and is not; one showing five, three of them greyed with the
 * card that would build them, tells an admin what the console will do and
 * what it will not do this month. Hiding them would make the missing ones
 * invisible to exactly the person who would ask for them.
 *
 * **Nothing here probes at runtime.** Whether a document exists is a fact
 * about this codebase, so it is written down rather than discovered by
 * fetching a URL and seeing what happens — a check like that turns a routing
 * mistake into a silently missing document.
 *
 * KS-30 reads this registry to assemble its combined export, and KS-28
 * (ส่งบัญชี) adds an entry to it. That is the whole reason it is a module
 * and not a list of links on one page.
 */

/** Every document type AC-4.1 names, in the order the selector lists them. */
export const DOCUMENT_TYPE_IDS = [
  'bills',
  'collection',
  'movements',
  'evaluations',
  'maintenance',
] as const;

export type DocumentTypeId = (typeof DOCUMENT_TYPE_IDS)[number];

export type DocumentAvailability =
  /** Built: `href` opens it for the chosen cycle. */
  | { ready: true; href: string }
  /**
   * Not built. `reason` is shown to the admin and `blockedBy` names the card
   * — so "why can't I tick this" is answerable from the screen rather than
   * from the backlog.
   */
  | { ready: false; reason: string; blockedBy: string };

export interface DocumentType {
  id: DocumentTypeId;
  /** As the family's own files title it. */
  label: string;
  /** One line: what an admin would use it for. */
  description: string;
  /**
   * Whether the document is scoped to one billing cycle.
   *
   * Not every document is: a maintenance log is a running record and a
   * tenant evaluation belongs to a person, so a combined export (KS-30)
   * cannot assume one date range covers everything it was handed.
   */
  perCycle: boolean;
  availability: DocumentAvailability;
}

/**
 * The registry, with each built document's link pointing at the given cycle.
 *
 * Takes the cycle rather than reading the clock so the same call serves the
 * screen, a test, and whatever KS-30 ends up assembling.
 */
export function documentTypesFor(cycle: BillingCycle): DocumentType[] {
  return [
    {
      id: 'bills',
      label: 'รายการค่าไฟ-ค่าห้อง',
      description: `ใบแจ้งค่าห้องพักทุกห้องใน${cycleLabel(cycle)} เรียงตามลำดับที่เดินเก็บ`,
      perCycle: true,
      availability: {
        ready: true,
        href: `${consolePath('console/bills/print')}?cycle=${cycle.id}`,
      },
    },
    {
      id: 'collection',
      label: 'แบบฟอร์มเก็บเงินค่าห้อง',
      description: 'ตารางติ๊กรับเงินรายวัน 26 ถึง 10 หนึ่งแผ่นทั้งตึก',
      perCycle: true,
      availability: {
        ready: true,
        href: `${consolePath('console/collection')}?cycle=${cycle.id}`,
      },
    },
    {
      /**
       * The data is all there — leases carry start, end, end reason and the
       * room transfer link (KS-12, KS-63, KS-64). What is missing is the
       * document: บัญชีแจ้งคนเข้า-ออก is a sheet with its own columns, and
       * transcribing it is its own piece of work, not a side effect of this
       * card.
       */
      id: 'movements',
      label: 'บัญชีคนเข้า-ออก',
      description: 'ใครเข้า ใครออก ออกเพราะอะไร ย้ายไปห้องไหน',
      perCycle: true,
      availability: {
        ready: false,
        reason: 'ข้อมูลมีครบแล้วในสัญญาเช่า แต่ยังไม่ได้ทำหน้าเอกสาร',
        blockedBy: 'KS-73',
      },
    },
    {
      id: 'evaluations',
      label: 'ใบผลประเมินผู้เช่า',
      description: 'ผลประเมิน A / B / C พร้อมหมายเหตุรายคน',
      perCycle: false,
      availability: {
        ready: false,
        // The grade field exists on the tenant already; the document that
        // prints it does not.
        reason: 'ช่องเกรดมีแล้วในโปรไฟล์ผู้เช่า แต่ยังไม่ได้ทำตัวเอกสาร',
        blockedBy: 'KS-15',
      },
    },
    {
      id: 'maintenance',
      label: 'รายการบำรุงรักษา',
      description: 'ประวัติซ่อมบำรุงอุปกรณ์รายห้องและส่วนกลาง',
      perCycle: false,
      availability: {
        ready: false,
        // Nothing to export: the asset and maintenance features are Phase 2,
        // so the console holds no maintenance record at all yet.
        reason: 'ยังไม่มีข้อมูลบำรุงรักษาในระบบเลย',
        blockedBy: 'F6 / F7 — Phase 2',
      },
    },
  ];
}

export function isReady(type: DocumentType): boolean {
  return type.availability.ready;
}

/**
 * The ids a `?include=` carries, keeping the registry's own order.
 *
 * **Absent and empty mean different things.** No `include` at all is an
 * admin arriving at the page, and every document they can actually produce
 * is ticked — that is the common case, the month's paperwork. An `include`
 * that is present but empty is an admin who unticked everything, and the
 * screen must show them that rather than helpfully re-ticking the lot.
 *
 * Unknown ids are dropped rather than rejected: a stale bookmark naming a
 * document type that was renamed should still show the rest.
 */
export function selectionFrom(raw: string | null, types: DocumentType[]): DocumentTypeId[] {
  if (raw === null) return types.filter(isReady).map((type) => type.id);

  const asked = new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  );

  return types.filter((type) => asked.has(type.id)).map((type) => type.id);
}

/** `?include=` for a selection — registry order, so the URL is stable. */
export function includeParam(
  selection: readonly DocumentTypeId[],
  types: DocumentType[],
): string {
  const chosen = new Set(selection);
  return types
    .filter((type) => chosen.has(type.id))
    .map((type) => type.id)
    .join(',');
}

/**
 * The documents a selection actually resolves to.
 *
 * Only the ready ones: an unbuilt type can be named in a URL — a bookmark
 * made before it was dropped, or a hand-typed one — and must not become a
 * link to a page that does not exist.
 */
export function selectedDocuments(
  selection: readonly DocumentTypeId[],
  types: DocumentType[],
): DocumentType[] {
  const chosen = new Set(selection);
  return types.filter((type) => chosen.has(type.id) && isReady(type));
}
