import type {
  Equipment,
  EquipmentDraft,
  MaintenanceRecord,
  MaintenanceRecordDraft,
} from '@/lib/models/maintenance';

/**
 * Equipment and the work done to it (รายการบำรุงรักษา). Records are
 * corrected by archiving and re-adding, like every other log here (rule 6/7).
 */
export interface MaintenanceRepository {
  listEquipment(): Promise<Equipment[]>;
  addEquipment(draft: EquipmentDraft): Promise<Equipment>;
  updateEquipment(id: string, changes: Partial<EquipmentDraft>): Promise<Equipment>;
  archiveEquipment(id: string): Promise<Equipment>;
  listRecords(): Promise<MaintenanceRecord[]>;
  addRecord(draft: MaintenanceRecordDraft): Promise<MaintenanceRecord>;
  archiveRecord(id: string): Promise<MaintenanceRecord>;
}
