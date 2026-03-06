import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingConfigOrmEntity } from '../../infrastructure/persistence/trading-config.orm-entity.js';

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
export class TradingConfigService implements OnModuleInit {
  private readonly logger = new Logger(TradingConfigService.name);
  private cache: TradingConfig = { ...DEFAULT_CONFIG };
  private onChangeCallbacks: Array<(cfg: TradingConfig) => void> = [];

  constructor(
    @InjectRepository(TradingConfigOrmEntity)
    private readonly repo: Repository<TradingConfigOrmEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    try {
      let row = await this.repo.findOneBy({ id: 'default' });
      if (!row) {
        row = this.repo.create({ id: 'default' });
        await this.repo.save(row);
      }
      this.cache = this.ormToConfig(row);
      this.logger.log('Trading config loaded from DB');
    } catch (err) {
      this.logger.warn(`Could not load trading config from DB, using defaults: ${String(err)}`);
    }
  }

  getConfig(): TradingConfig {
    return { ...this.cache };
  }

  async updateConfig(partial: PartialTradingConfig): Promise<TradingConfig> {
    const updated: TradingConfig = { ...this.cache, ...partial };
    const orm = this.configToOrm(updated);
    await this.repo.save(orm);
    this.cache = updated;
    this.logger.log(`Trading config updated: ${JSON.stringify(partial)}`);
    for (const cb of this.onChangeCallbacks) {
      cb(this.cache);
    }
    return { ...this.cache };
  }

  /** Register a callback to be called whenever config changes */
  onChange(cb: (cfg: TradingConfig) => void): void {
    this.onChangeCallbacks.push(cb);
  }

  private ormToConfig(orm: TradingConfigOrmEntity): TradingConfig {
    return {
      modelSnapshotId: orm.modelSnapshotId,
      signalThreshold: Number(orm.signalThreshold),
      positionMode: orm.positionMode as 'fixed' | 'percent',
      fixedAmount: Number(orm.fixedAmount),
      positionSizePct: Number(orm.positionSizePct),
      activePairs: Array.isArray(orm.activePairs) ? orm.activePairs : JSON.parse(orm.activePairs as unknown as string),
      signalTimeframe: orm.signalTimeframe,
      pollingIntervalMs: orm.pollingIntervalMs,
      cooldownMs: orm.cooldownMs,
      stopLossPct: orm.stopLossPct !== null ? Number(orm.stopLossPct) : null,
      takeProfitPct: orm.takeProfitPct !== null ? Number(orm.takeProfitPct) : null,
      maxDrawdownPct: orm.maxDrawdownPct !== null ? Number(orm.maxDrawdownPct) : null,
    };
  }

  private configToOrm(cfg: TradingConfig): TradingConfigOrmEntity {
    const orm = new TradingConfigOrmEntity();
    orm.id = 'default';
    orm.modelSnapshotId = cfg.modelSnapshotId;
    orm.signalThreshold = cfg.signalThreshold;
    orm.positionMode = cfg.positionMode;
    orm.fixedAmount = cfg.fixedAmount;
    orm.positionSizePct = cfg.positionSizePct;
    orm.activePairs = cfg.activePairs;
    orm.signalTimeframe = cfg.signalTimeframe;
    orm.pollingIntervalMs = cfg.pollingIntervalMs;
    orm.cooldownMs = cfg.cooldownMs;
    orm.stopLossPct = cfg.stopLossPct;
    orm.takeProfitPct = cfg.takeProfitPct;
    orm.maxDrawdownPct = cfg.maxDrawdownPct;
    return orm;
  }
}
