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
];
