import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import { createSheetsBillRepository } from '@/lib/repositories/sheets/sheets-bill-repository';
import { createSheetsMeterReadingRepository } from '@/lib/repositories/sheets/sheets-meter-reading-repository';
import { createSeedSheets } from '@/lib/repositories/memory/seed-sheet';
import { saveRoundReading } from './meter-reading-save';
import { startRound } from './meter-round';
import { createSheetsRoomRepository } from '@/lib/repositories/sheets/sheets-room-repository';

const NOV = cycleIssuedIn(2026, 10);

async function setup() {
  const sheet = createSeedSheets();
  const readings = createSheetsMeterReadingRepository(sheet);
  const bills = createSheetsBillRepository(sheet);
  // Last round's close for room 101: 27 ต.ค., 12,047 → 12,102.
  await readings.recordReading({
    roomId: '101', meterType: 'electricity', readDate: new Date(2026, 9, 27),
    previousReading: 12047, currentReading: 12102, ratePerUnit: 7, note: null,
  });
  return { sheet, readings, bills };
}

const draft = (currentReading: number) => ({
  roomId: '101', meterType: 'electricity' as const, readDate: new Date(2026, 10, 25),
  previousReading: 0, currentReading, ratePerUnit: 7, note: null,
});

describe('saveRoundReading', () => {
  it("records against last round's close, whatever previous the page sent", async () => {
    const { readings, bills } = await setup();
    const { saved } = await saveRoundReading({ readings, bills }, draft(12160), NOV);
    expect(saved).toMatchObject({ previousReading: 12102, currentReading: 12160 });
  });

  it('replaces a figure already saved this round, against the same previous', async () => {
    const { readings, bills } = await setup();
    await saveRoundReading({ readings, bills }, draft(12999), NOV); // typo
    const { saved, replaced } = await saveRoundReading({ readings, bills }, draft(12160), NOV);
    expect(saved.previousReading).toBe(12102);
    expect(replaced.map((r) => r.currentReading)).toEqual([12999]);
    const live = (await readings.listReadingsForRoom('101')).filter((r) => r.readDate >= new Date(2026, 10, 1));
    expect(live.map((r) => r.currentReading)).toEqual([12160]);
  });

  it('keeps ครั้งก่อน fixed in the round after saving', async () => {
    const { sheet, readings, bills } = await setup();
    await saveRoundReading({ readings, bills }, draft(12160), NOV);
    const round = startRound(await createSheetsRoomRepository(sheet).listRooms(), await readings.listReadings(), NOV);
    const stop = round.stops.find((s) => s.roomId === '101' && s.meterType === 'electricity')!;
    expect(stop).toMatchObject({ previousReading: 12102, currentReading: 12160, state: 'entered' });
  });

  it('uses the tenancy start meter when billing starts this cycle', async () => {
    const { readings, bills } = await setup();
    const { saved } = await saveRoundReading({ readings, bills }, draft(12160), NOV, { startMeter: 12110 });
    expect(saved.previousReading).toBe(12110);
  });

  it('refuses once the room is billed for the cycle', async () => {
    const { readings, bills } = await setup();
    await bills.issueBill({
      roomId: '101', leaseId: null, cycle: NOV.id, issueDate: NOV.issueDate, dueDate: NOV.dueDate,
      rentAmount: 0, electricityAmount: 0, waterAmount: 0, electricityPrevious: null,
      electricityCurrent: null, waterQuantity: null, arrearsNote: null,
    });
    await expect(saveRoundReading({ readings, bills }, draft(12160), NOV, { roomLabel: '101' })).rejects.toThrow(
      /ออกบิลห้อง 101 รอบนี้แล้ว/,
    );
  });

  it('refuses a figure below the previous one', async () => {
    const { readings, bills } = await setup();
    await expect(saveRoundReading({ readings, bills }, draft(12000), NOV)).rejects.toThrow(/ถอยหลัง/);
  });
});

