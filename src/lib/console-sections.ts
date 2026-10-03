import { consolePath } from './console/paths';

/**
 * The console's map, organised the way the month is worked (สมุดประจำเดือน).
 *
 * Every screen is one of three things:
 *
 * - **the six steps of the month**, in the order they happen: read the meters,
 *   check water, issue bills, record money, print the collection sheet, then
 *   the month's paperwork;
 * - **the register** — the building and the people in it, which persist from
 *   month to month;
 * - **system** — rarely visited, kept out of the way under อื่นๆ.
 *
 * Only sections that actually exist. Adding a disabled entry for an unbuilt
 * feature makes a young tool feel broken — later cards append here as they land.
 */

export type SectionGroup = 'home' | 'month' | 'register' | 'system';

export interface ConsoleSection {
  id: string;
  label: string;
  href: string;
  group: SectionGroup;
  /** The step's number in the month, 1–6. Month steps only. */
  step?: number;
  /** A one-glyph badge for non-step entries, drawn in the step circle. */
  glyph?: string;
}

export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { id: 'home', label: 'หน้าสมุด', href: consolePath('console'), group: 'home', glyph: '◉' },
  // Points at the desk grid (KS-60), not the round itself. The round takes
  // over the whole screen and hides every way out but its own ✕, so a nav
  // item that starts one would mean you cannot look at the meter section
  // without first being trapped in a walk of the building. The grid is the
  // section's home; the round is an action started from it.
  { id: 'meter-round', label: 'จดมิเตอร์', href: consolePath('console/meter-round/grid'), group: 'month', step: 1 },
  { id: 'water', label: 'ค่าน้ำ', href: consolePath('console/water'), group: 'month', step: 2 },
  { id: 'bills', label: 'ออกบิล', href: consolePath('console/bills'), group: 'month', step: 3 },
  { id: 'payments', label: 'รับเงิน', href: consolePath('console/payments'), group: 'month', step: 4 },
  // Next to รับเงิน because they are the two halves of the same fortnight:
  // one writes what arrived, this one is the sheet you read to see who has
  // not paid yet (KS-25).
  { id: 'collection', label: 'ใบเก็บเงิน', href: consolePath('console/collection'), group: 'month', step: 5 },
  // The document centre (KS-27). Last because that is when it is used: the
  // month is issued and collected, and then somebody wants the paperwork.
  { id: 'documents', label: 'เอกสาร', href: consolePath('console/documents'), group: 'month', step: 6 },
  { id: 'rooms', label: 'ตึกและห้อง', href: consolePath('console/rooms'), group: 'register', glyph: '⌂' },
  { id: 'tenants', label: 'ผู้เช่าและสัญญา', href: consolePath('console/tenants'), group: 'register', glyph: '☺' },
  // Not a daily section, but a diagnostic nobody can find is the same as one
  // that does not exist — which was the whole complaint KS-67 came from. It
  // lives under อื่นๆ on the phone and in the spine's footer on a desk.
  { id: 'health', label: 'สถานะระบบ', href: consolePath('console/health'), group: 'system', glyph: '⚙' },
];

export const MONTH_STEPS = CONSOLE_SECTIONS.filter((s) => s.group === 'month');
export const REGISTER_SECTIONS = CONSOLE_SECTIONS.filter((s) => s.group === 'register');
export const SYSTEM_SECTIONS = CONSOLE_SECTIONS.filter((s) => s.group === 'system');

export function sectionById(id: string): ConsoleSection | undefined {
  return CONSOLE_SECTIONS.find((s) => s.id === id);
}

/** The phone's bottom bar: four tabs, each a home for several sections. */
export type TabId = 'book' | 'building' | 'tenants' | 'more';

export interface ConsoleTab {
  id: TabId;
  label: string;
  glyph: string;
  href: string;
}

export const CONSOLE_TABS: ConsoleTab[] = [
  { id: 'book', label: 'สมุด', glyph: '✎', href: consolePath('console') },
  { id: 'building', label: 'ตึก', glyph: '⌂', href: consolePath('console/rooms') },
  { id: 'tenants', label: 'ผู้เช่า', glyph: '☺', href: consolePath('console/tenants') },
  { id: 'more', label: 'อื่นๆ', glyph: '≡', href: consolePath('console/more') },
];

/** Which tab lights up for a section. The month's steps all live under สมุด. */
export function tabFor(sectionId: string): TabId {
  if (sectionId === 'rooms') return 'building';
  if (sectionId === 'tenants') return 'tenants';
  if (sectionId === 'health' || sectionId === 'more') return 'more';
  return 'book';
}
