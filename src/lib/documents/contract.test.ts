import { describe, expect, it } from 'vitest';
import { resolveSettings } from '@/lib/models/settings';
import type { TemplateBlock } from '@/lib/models/document-template';
import { makeLease, makeMeterReading, makeRoom, makeTenant } from '@/lib/test-support/fixtures';
import { contractFor, contractValues, rentSplit, startingMeter } from './contract';
import { segmentsToText } from './template';

const settings = resolveSettings([
  { key: 'landlord_name', value: 'นาย ผู้ให้ ตัวอย่าง', note: '', archived: false },
]);

function input(overrides: Partial<Parameters<typeof contractFor>[0]> = {}) {
  return {
    lease: makeLease({ rentRate: 3000, deposit: 2000, advanceRent: 3000, startDate: new Date(2026, 10, 1), signedDate: null }),
    tenant: makeTenant({
      contractDetails: {
        birthDate: new Date(2000, 10, 2),
        position: 'พนักงานขาย',
        workplace: 'บิ๊กซี',
        vehicleType: '',
        vehicleBrand: '',
        vehicleModel: '',
        vehicleColor: '',
        vehiclePlate: '',
      },
    }),
    room: makeRoom({ id: '202', label: '202', floor: 2 }),
    settings,
    blocks: [] as TemplateBlock[],
    readings: [
      makeMeterReading({ roomId: '101', readDate: new Date(2026, 9, 27), previousReading: 1, currentReading: 13357 }),
    ],
    ...overrides,
  };
}

describe('rentSplit', () => {
  it('splits the contract rent into room + furniture, which add back up', () => {
    expect(rentSplit(3000, 1300)).toEqual({ room: 1700, furniture: 1300 });
  });
  it('does not print a negative room rent', () => {
    expect(rentSplit(1000, 1300)).toEqual({ room: null, furniture: 1300 });
  });
  it('treats no furniture fee as all room rent', () => {
    expect(rentSplit(2500, null)).toEqual({ room: 2500, furniture: null });
  });
});

describe('contractValues', () => {
  it('fills the money lines from the lease and the settings', () => {
    const values = contractValues(input());
    expect(values).toMatchObject({
      ค่าเช่ารวม: '3,000',
      ค่าห้อง: '1,700',
      ค่าเฟอร์นิเจอร์: '1,300',
      เงินประกัน: '2,000',
      คงจ่าย: '5,000',
      ผู้ให้เช่า: 'นาย ผู้ให้ ตัวอย่าง',
      ค่าไฟต่อหน่วย: '7',
    });
  });

  it('takes the booking deposit off what is still to pay', () => {
    const values = contractValues(input({ lease: makeLease({ rentRate: 3000, deposit: 2000, advanceRent: 3000, bookingFee: 1000 }) }));
    expect(values['คงจ่าย']).toBe('4,000');
  });

  it('uses the standard deposit when the lease has none on record', () => {
    expect(contractValues(input({ lease: makeLease({ deposit: 0 }) }))['เงินประกัน']).toBe('2,000');
  });

  it('works out the age on the contract date, not today', () => {
    // Born 2 Nov 2000; the contract is dated 1 Nov 2026 — one day short of 26.
    expect(contractValues(input())['อายุ']).toBe('25');
  });

  it('dates the contract by its start when no signing date is recorded', () => {
    expect(contractValues(input())).toMatchObject({ วันที่ทำสัญญา: '1', เดือนที่ทำสัญญา: 'พฤศจิกายน', ปีที่ทำสัญญา: '2569' });
  });
});

describe('startingMeter', () => {
  it('takes the newest electricity reading on or before the start date', () => {
    const lease = makeLease({ roomId: '202', startDate: new Date(2026, 10, 1) });
    const readings = [
      makeMeterReading({ roomId: '202', readDate: new Date(2026, 8, 27), currentReading: 13300 }),
      makeMeterReading({ roomId: '202', readDate: new Date(2026, 9, 27), currentReading: 13357 }),
      makeMeterReading({ roomId: '202', readDate: new Date(2026, 10, 27), currentReading: 13500 }),
      makeMeterReading({ roomId: '202', meterType: 'water', readDate: new Date(2026, 9, 28), currentReading: 9 }),
    ];
    expect(startingMeter(readings, lease)).toBe(13357);
  });
});

describe('contractFor', () => {
  it('prints the built-in wording when the templates tab has none, and says so', () => {
    const contract = contractFor(input());
    expect(contract.usingDefaultWording).toBe(true);
    const title = contract.blocks.find((b) => b.kind === 'title')!;
    expect(segmentsToText(title.lines[0]!)).toContain('ห้อง 202');
    expect(contract.blocks.filter((b) => b.kind === 'item_row')).toHaveLength(12);
    expect(contract.blocks.filter((b) => b.kind === 'fee_row')).toHaveLength(6);
  });

  it('uses the stored blocks in position order, skipping archived ones', () => {
    const block = (id: string, position: number, body: string, archived = false): TemplateBlock => ({
      id, docType: 'contract', position, kind: 'paragraph', heading: '', body, extra: '', archived,
    });
    const contract = contractFor(
      input({ blocks: [block('b', 20, 'สอง'), block('a', 10, 'หนึ่ง {ห้อง}'), block('c', 15, 'ทิ้ง', true)] }),
    );
    expect(contract.usingDefaultWording).toBe(false);
    expect(contract.blocks.map((b) => segmentsToText(b.lines[0]!))).toEqual(['หนึ่ง 202', 'สอง']);
  });

  it('warns about what will print blank, a placeholder name, and an unknown placeholder', () => {
    const contract = contractFor(
      input({
        tenant: makeTenant({ fullName: 'ผู้เช่าห้อง 202 (รอชื่อ)', address: { houseNo: '', road: '', subdistrict: '', district: '', province: '', postcode: '' } }),
        blocks: [
          { id: 'x', docType: 'contract', position: 1, kind: 'paragraph', heading: '', body: '{ที่อยู่ผู้เช่า} {อายุ} {ไม่มีจริง}', extra: '', archived: false },
        ],
      }),
    );
    expect(contract.warnings.join('\n')).toMatch(/\(รอชื่อ\)/);
    expect(contract.warnings.join('\n')).toMatch(/ยังไม่มีที่อยู่ผู้เช่า/);
    expect(contract.warnings.join('\n')).toMatch(/ยังไม่มีวันเกิดผู้เช่า/);
    expect(contract.warnings.join('\n')).toMatch(/\{ไม่มีจริง\}/);
  });
});
