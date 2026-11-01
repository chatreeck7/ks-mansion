import type { Setting, SettingValues } from '@/lib/models/settings';

/**
 * The building's printable facts (KS-24) — see `src/lib/models/settings.ts`.
 *
 * Current state, edited in place: a setting has one value, and changing the
 * bank account is meant to change what the next bill prints. Bills already
 * issued store their own figures, so nothing here restates history.
 */
export interface SettingsRepository {
  listSettings(): Promise<Setting[]>;
  /** Every defined setting, stored value over default. */
  resolveSettings(): Promise<SettingValues>;
  /** Writes one value, adding the row if the key has never been saved. */
  saveSetting(key: string, value: string): Promise<Setting>;
}
