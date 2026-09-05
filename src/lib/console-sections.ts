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
  // The round itself hides all navigation (KS-72) — but it has to be
  // reachable from somewhere, and the phone tab bar is where the person
  // about to walk the building already is.
  { id: 'meter-round', label: 'จดมิเตอร์', href: consolePath('console/meter-round') },
  // Not a daily section, but a diagnostic nobody can find is the same as one
  // that does not exist — which was the whole complaint KS-67 came from.
  { id: 'health', label: 'สถานะระบบ', href: consolePath('console/health') },
];
