import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PresetRecord, PresetRepositoryPort } from '../../domain/ports/preset-repository.port.js';
import { PRESET_REPOSITORY } from '../../domain/ports/preset-repository.port.js';
import { CreateWalletUseCase } from './create-wallet.use-case.js';

export type PresetChangeEvent = 'activated' | 'paused' | 'archived' | 'config_updated';

export interface TradingConfig {
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
}

export type PartialTradingConfig = Partial<TradingConfig>;

const DEFAULT_CONFIG: TradingConfig = {
  modelSnapshotId: 'latest',
  signalThreshold: 0.0005,
  positionMode: 'fixed',
  fixedAmount: 0.001,
  positionSizePct: 0.5,
  activePairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  signalTimeframe: '5m',
  pollingIntervalMs: 5000,
  cooldownMs: 0,
  stopLossPct: null,
  takeProfitPct: null,
  maxDrawdownPct: null,
};

@Injectable()
export class PresetService implements OnModuleInit {
  private readonly logger = new Logger(PresetService.name);
  private configChangeCallbacks: Array<(cfg: TradingConfig) => void> = [];
  private presetChangeCallbacks: Array<(preset: PresetRecord, event: PresetChangeEvent) => void> = [];
  private cachedConfig: TradingConfig = { ...DEFAULT_CONFIG };

  constructor(
    @Inject(PRESET_REPOSITORY) private readonly presetRepo: PresetRepositoryPort,
    private readonly createWalletUseCase: CreateWalletUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshConfigCache();
    this.logger.log('PresetService initialized');
  }

  private async refreshConfigCache(): Promise<void> {
    const preset = await this.getFirstActivePreset();
    this.cachedConfig = preset ? this.recordToConfig(preset) : { ...DEFAULT_CONFIG };
  }

  /** Returns config of first active preset (for SimulationService backward compat) */
  getConfigForSimulation(): TradingConfig {
    return { ...this.cachedConfig };
  }

  /** Update config of first active preset (for backward compat with PUT /trading/config) */
  async updateConfigForSimulation(partial: PartialTradingConfig): Promise<TradingConfig> {
    const preset = await this.getFirstActivePreset();
    if (!preset) {
      this.logger.warn('No active preset to update, using defaults');
      return { ...DEFAULT_CONFIG, ...partial };
    }
    const updated: PresetRecord = {
      ...preset,
      modelSnapshotId: partial.modelSnapshotId ?? preset.modelSnapshotId,
      signalThreshold: partial.signalThreshold ?? preset.signalThreshold,
      positionMode: (partial.positionMode ?? preset.positionMode) as 'fixed' | 'percent',
      fixedAmount: partial.fixedAmount ?? preset.fixedAmount,
      positionSizePct: partial.positionSizePct ?? preset.positionSizePct,
      activePairs: partial.activePairs ?? preset.activePairs,
      signalTimeframe: partial.signalTimeframe ?? preset.signalTimeframe,
      pollingIntervalMs: partial.pollingIntervalMs ?? preset.pollingIntervalMs,
      cooldownMs: partial.cooldownMs ?? preset.cooldownMs,
      stopLossPct: partial.stopLossPct !== undefined ? partial.stopLossPct : preset.stopLossPct,
      takeProfitPct: partial.takeProfitPct !== undefined ? partial.takeProfitPct : preset.takeProfitPct,
      maxDrawdownPct: partial.maxDrawdownPct !== undefined ? partial.maxDrawdownPct : preset.maxDrawdownPct,
      updatedAt: new Date(),
    };
    await this.presetRepo.save(updated);
    this.logger.log(`Preset ${preset.id} config updated`);
    const cfg = this.recordToConfig(updated);
    this.cachedConfig = cfg;
    for (const cb of this.configChangeCallbacks) {
      cb(cfg);
    }
    return cfg;
  }

  /** Register callback when config changes (for SimulationService — backward compat, alias of 'config_updated') */
  onConfigChange(cb: (cfg: TradingConfig) => void): void {
    this.configChangeCallbacks.push(cb);
  }

  /** Register callback for any preset lifecycle change (for SimulationOrchestrator) */
  onPresetChange(cb: (preset: PresetRecord, event: PresetChangeEvent) => void): void {
    this.presetChangeCallbacks.push(cb);
  }

  private firePresetChange(preset: PresetRecord, event: PresetChangeEvent): void {
    for (const cb of this.presetChangeCallbacks) {
      cb(preset, event);
    }
  }

  async getAll(): Promise<PresetRecord[]> {
    return this.presetRepo.findAll();
  }

  async getById(id: string): Promise<PresetRecord | null> {
    return this.presetRepo.findById(id);
  }

  async getActive(): Promise<PresetRecord[]> {
    return this.presetRepo.findByStatus('active');
  }

  async create(params: {
    name: string;
    initialCapital?: number;
    config?: PartialTradingConfig;
  }): Promise<PresetRecord> {
    const id = randomUUID();
    const ownerId = `preset-${id}`;
    const initialCapital = params.initialCapital ?? 10000;
    const { walletId } = await this.createWalletUseCase.execute({
      ownerId,
      initialUsdtBalance: initialCapital,
    });

    const cfg = { ...DEFAULT_CONFIG, ...params.config };
    const preset: PresetRecord = {
      id,
      name: params.name,
      walletId,
      status: 'active',
      initialCapital,
      modelSnapshotId: cfg.modelSnapshotId,
      signalThreshold: cfg.signalThreshold,
      positionMode: cfg.positionMode,
      fixedAmount: cfg.fixedAmount,
      positionSizePct: cfg.positionSizePct,
      activePairs: cfg.activePairs,
      signalTimeframe: cfg.signalTimeframe,
      pollingIntervalMs: cfg.pollingIntervalMs,
      cooldownMs: cfg.cooldownMs,
      stopLossPct: cfg.stopLossPct,
      takeProfitPct: cfg.takeProfitPct,
      maxDrawdownPct: cfg.maxDrawdownPct,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.presetRepo.save(preset);
    this.logger.log(`Preset created: ${preset.name} (${id})`);
    if (preset.status === 'active') {
      this.firePresetChange(preset, 'activated');
    }
    return preset;
  }

  async update(id: string, partial: Partial<PresetRecord>): Promise<PresetRecord> {
    const preset = await this.presetRepo.findById(id);
    if (!preset) throw new NotFoundException(`Preset ${id} not found`);
    const updated: PresetRecord = { ...preset, ...partial, id, updatedAt: new Date() };
    await this.presetRepo.save(updated);

    const wasActive = preset.status === 'active';
    const isNowActive = updated.status === 'active';

    if (!wasActive && isNowActive) {
      this.firePresetChange(updated, 'activated');
    } else if (wasActive && !isNowActive) {
      const event: PresetChangeEvent = updated.status === 'paused' ? 'paused' : 'archived';
      this.firePresetChange(updated, event);
    } else if (wasActive && isNowActive) {
      // Config fields changed on an active preset
      const cfg = this.recordToConfig(updated);
      this.cachedConfig = cfg;
      for (const cb of this.configChangeCallbacks) {
        cb(cfg);
      }
      this.firePresetChange(updated, 'config_updated');
    }

    return updated;
  }

  async activate(id: string): Promise<PresetRecord> {
    return this.update(id, { status: 'active' });
  }

  async pause(id: string): Promise<PresetRecord> {
    return this.update(id, { status: 'paused' });
  }

  async archive(id: string): Promise<PresetRecord> {
    return this.update(id, { status: 'archived' });
  }

  private async getFirstActivePreset(): Promise<PresetRecord | null> {
    const active = await this.presetRepo.findByStatus('active');
    return active[0] ?? null;
  }

  private getFirstActivePresetSync(): PresetRecord | null {
    return null;
  }

  private recordToConfig(rec: PresetRecord): TradingConfig {
    return {
      modelSnapshotId: rec.modelSnapshotId,
      signalThreshold: rec.signalThreshold,
      positionMode: rec.positionMode,
      fixedAmount: rec.fixedAmount,
      positionSizePct: rec.positionSizePct,
      activePairs: rec.activePairs,
      signalTimeframe: rec.signalTimeframe,
      pollingIntervalMs: rec.pollingIntervalMs,
      cooldownMs: rec.cooldownMs,
      stopLossPct: rec.stopLossPct,
      takeProfitPct: rec.takeProfitPct,
      maxDrawdownPct: rec.maxDrawdownPct,
    };
  }
}
