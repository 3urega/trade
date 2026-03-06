export const PRESET_REPOSITORY = Symbol('PRESET_REPOSITORY');

export interface PresetRecord {
  id: string;
  name: string;
  walletId: string;
  status: 'active' | 'paused' | 'archived';
  initialCapital: number;
  modelSnapshotId: string;
  signalThreshold: number;
  positionMode: 'fixed' | 'percent';
  fixedAmount: number;
  positionSizePct: number;
  activePairs: string[];
  signalTimeframe: string;
  pollingIntervalMs: number;
  cooldownMs: number;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  maxDrawdownPct: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresetRepositoryPort {
  save(preset: PresetRecord): Promise<void>;
  findById(id: string): Promise<PresetRecord | null>;
  findAll(): Promise<PresetRecord[]>;
  findByStatus(status: 'active' | 'paused' | 'archived'): Promise<PresetRecord[]>;
}
