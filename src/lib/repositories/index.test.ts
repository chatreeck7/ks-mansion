import { describe, expect, it } from 'vitest';
import { getRoomRepository } from './index';

const FAKE_ENV = {
  GOOGLE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
  SHEETS_SPREADSHEET_ID: 'sheet-1',
};

describe('getRoomRepository', () => {
  it('falls back to the seeded registry when Sheets is not configured', async () => {
    expect(await getRoomRepository().listRooms()).toHaveLength(27);
    expect(await getRoomRepository({}).listRooms()).toHaveLength(27);
  });

  it('falls back when either credential is blank', async () => {
    // A half-configured environment must not produce a client that fails at
    // request time; it should behave exactly like an unconfigured one.
    const cases = [
      { ...FAKE_ENV, SHEETS_SPREADSHEET_ID: '' },
      { ...FAKE_ENV, GOOGLE_SERVICE_ACCOUNT_JSON: '   ' },
    ];
    for (const env of cases) {
      expect(await getRoomRepository(env).listRooms()).toHaveLength(27);
    }
  });

  it('returns a Sheets-backed repository once both credentials are present', async () => {
    // Not called here — constructing it must not touch the network, so this
    // asserts wiring only. Credentials are parsed lazily on first read.
    const repo = getRoomRepository(FAKE_ENV);
    expect(typeof repo.listRooms).toBe('function');
    expect(typeof repo.getRoom).toBe('function');
    // Proof it is not the memory one: the memory repo would resolve 27 rooms.
    await expect(repo.listRooms()).rejects.toThrow();
  });
});
