import { describe, expect, it } from 'vitest';
import { parseThaiDate } from '@/lib/format/thai-parse';
import { createGoogleSheetsClient } from './google-sheets-client';
import { BILLS_TAB, createSheetsBillRepository } from './sheets-bill-repository';
import { createSheetsMeterReadingRepository } from './sheets-meter-reading-repository';
import { createSheetsRoomRepository } from './sheets-room-repository';
import { findRow, readTab } from './tab-reader';
import { buildRow } from './tab-writer';

/**
 * Corrects what the ต.ค. 2569 seed got wrong (2 พ.ย. 2569).
 *
 * The seed read the monthly report's ค่าไฟ sheet, where each water-meter line
 * sits one column to the right of an electricity line (`ค่าน้ำ` is in column
 * C, not B). The seed looked for it in B, so it skipped both water meters:
 *
 * - ร้านซักผ้า 8,047 → 8,071 at ฿20 (480 baht — the bill's amount was right),
 * - ห้องใต้ถุน 1,189 → 1,189 at ฿15,
 *
 * and the laundry bill b-006 got `water_quantity` 0 instead of 24. Without
 * the readings the console treats the laundry as เหมาจ่าย with 0 occupants,
 * which is why ค่าน้ำ showed 480 short. Room 206's `rent_rate` was also left
 * at 2,500 when its lease is 3,000.
 *
 *   KS_MANSION_DB_SPREADSHEET_ID=<the live id> \
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   KS_2569_10_FIX=dry-run \   # or `yes`
 *   npx vitest run src/lib/repositories/sheets/ks-2569-10-water.correction.test.ts
 *
 * Every step checks first and is skipped when already done, and the bill fix
 * refuses unless the cell still holds the wrong 0 — same contract as the
 * l-001 correction.
 */

const spreadsheetId = process.env.KS_MANSION_DB_SPREADSHEET_ID?.trim() ?? '';
const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
const mode = process.env.KS_2569_10_FIX?.trim() ?? '';
const asked = mode === 'yes' || mode === 'dry-run';
const enabled = asked && spreadsheetId !== '' && credentialsJson !== '';

describe.runIf(asked && !enabled)('ต.ค. 2569 water correction configuration', () => {
  it('has everything it needs', () => {
    throw new Error('KS_2569_10_FIX is set but the spreadsheet id or credentials came through empty.');
  });
});

const READ_DATE = parseThaiDate('27 ต.ค. 2569')!;
const MISSING_WATER = [
  { roomId: 'laundry', previousReading: 8047, currentReading: 8071, ratePerUnit: 20 },
  { roomId: 'undercroft', previousReading: 1189, currentReading: 1189, ratePerUnit: 15 },
];
const LAUNDRY_BILL = { id: 'b-006', roomId: 'laundry', cycle: '2026-10', wrong: 0, right: 24 };

describe.skipIf(!enabled)('correction: ต.ค. 2569 water meters and the laundry bill', () => {
  it('adds the two water readings, fixes b-006 water_quantity, and room 206 rent', async () => {
    const client = createGoogleSheetsClient({ credentialsJson, spreadsheetId });
    const dry = mode === 'dry-run';
    const log = (line: string) => console.log(`[ต.ค. fix${dry ? ' dry-run' : ''}] ${line}`);
    const readings = createSheetsMeterReadingRepository(client);
    const bills = createSheetsBillRepository(client);
    const rooms = createSheetsRoomRepository(client);

    // 1. Water readings.
    const existing = await readings.listReadings();
    for (const water of MISSING_WATER) {
      const already = existing.some(
        (r) =>
          r.roomId === water.roomId &&
          r.meterType === 'water' &&
          r.readDate.getTime() === READ_DATE.getTime(),
      );
      if (already) {
        log(`${water.roomId} water: already recorded`);
        continue;
      }
      log(`${water.roomId} water: record ${water.previousReading} → ${water.currentReading} @${water.ratePerUnit}`);
      if (!dry) {
        await readings.recordReading({ ...water, meterType: 'water', readDate: READ_DATE, note: null });
      }
    }

    // 2. b-006 water_quantity.
    const bill = await bills.getBill(LAUNDRY_BILL.id);
    expect(bill, `${LAUNDRY_BILL.id} is not in this spreadsheet`).not.toBeNull();
    expect(bill).toMatchObject({ roomId: LAUNDRY_BILL.roomId, cycle: LAUNDRY_BILL.cycle, waterAmount: 480 });
    if (bill!.waterQuantity === LAUNDRY_BILL.right) {
      log(`${LAUNDRY_BILL.id}: water_quantity already ${LAUNDRY_BILL.right}`);
    } else {
      expect(
        bill!.waterQuantity,
        `${LAUNDRY_BILL.id}.water_quantity reads ${bill!.waterQuantity}, not the seeded ${LAUNDRY_BILL.wrong} — someone changed it; stopping.`,
      ).toBe(LAUNDRY_BILL.wrong);
      log(`${LAUNDRY_BILL.id}: water_quantity ${LAUNDRY_BILL.wrong} → ${LAUNDRY_BILL.right}`);
      if (!dry) {
        // Bills are append-only to the console (rule 6); this is the one
        // seeded working figure that was wrong on the day it was written,
        // corrected by hand-run migration rather than by a console action.
        const tab = await readTab(client, BILLS_TAB.tabName, BILLS_TAB.contract);
        const found = findRow(tab, 'id', LAUNDRY_BILL.id)!;
        const next = buildRow(tab, found.row, { water_quantity: LAUNDRY_BILL.right });
        await client.updateRow(BILLS_TAB.tabName, found.rowNumber, next);
        const after = await bills.getBill(LAUNDRY_BILL.id);
        expect(after).toMatchObject({
          waterQuantity: LAUNDRY_BILL.right,
          waterAmount: bill!.waterAmount,
          rentAmount: bill!.rentAmount,
          electricityAmount: bill!.electricityAmount,
        });
      }
    }

    // 3. Room 206's advertised rent matches its lease.
    const room = await rooms.getRoom('206');
    if (room?.rentRate === 3000) {
      log('room 206: rent_rate already 3,000');
    } else {
      log(`room 206: rent_rate ${room?.rentRate} → 3,000`);
      if (!dry) await rooms.updateRoom('206', { rentRate: 3000 });
    }

    if (!dry) {
      const water = (await readings.listReadings()).filter((r) => r.meterType === 'water');
      expect(water.map((r) => r.roomId).sort()).toEqual(['laundry', 'undercroft']);
    }
  }, 120_000);
});
