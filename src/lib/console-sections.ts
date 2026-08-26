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
  // Not a daily section, but a diagnostic nobody can find is the same as one
  // that does not exist — which was the whole complaint KS-67 came from.
  { id: 'health', label: 'สถานะระบบ', href: consolePath('console/health') },
];
