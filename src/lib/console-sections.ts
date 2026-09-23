import { consolePath } from './console/paths';

export interface ConsoleSection {
  id: string;
  label: string;
  href: string;
}

/**
 * Only sections that actually exist. Adding a disabled entry for an unbuilt
 * feature makes a young tool feel broken — later cards append here as they land.
 */
export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { id: 'rooms', label: 'ห้อง', href: consolePath('console/rooms') },
  { id: 'tenants', label: 'ผู้เช่า', href: consolePath('console/tenants') },
  // Points at the desk grid (KS-60), not the round itself. The round takes
  // over the whole screen and hides every way out but its own ✕, so a nav
  // item that starts one would mean you cannot look at the meter section
  // without first being trapped in a walk of the building. The grid is the
  // section's home; the round is an action started from it.
  { id: 'meter-round', label: 'จดมิเตอร์', href: consolePath('console/meter-round/grid') },
  // Likely to fold into a billing section once bills exist (KS-21), but a
  // screen nobody can find is a screen that does not exist — the complaint
  // KS-67 came from.
  { id: 'water', label: 'ค่าน้ำ', href: consolePath('console/water') },
  { id: 'bills', label: 'บิล', href: consolePath('console/bills') },
  { id: 'payments', label: 'รับเงิน', href: consolePath('console/payments') },
  // Next to รับเงิน because they are the two halves of the same fortnight:
  // one writes what arrived, this one is the sheet you read to see who has
  // not paid yet (KS-25).
  { id: 'collection', label: 'ใบเก็บเงิน', href: consolePath('console/collection') },
  // The document centre (KS-27). Sits after the billing run because that is
  // when it is used: the month is issued and collected, and then somebody
  // wants the paperwork for it in one place.
  { id: 'documents', label: 'เอกสาร', href: consolePath('console/documents') },
  // Not a daily section, but a diagnostic nobody can find is the same as one
  // that does not exist — which was the whole complaint KS-67 came from.
  { id: 'health', label: 'สถานะระบบ', href: consolePath('console/health') },
];
