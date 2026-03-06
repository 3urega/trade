import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PresetRecord, PresetRepositoryPort } from '../../domain/ports/preset-repository.port.js';
import { PRESET_REPOSITORY } from '../../domain/ports/preset-repository.port.js';
import { TradingPresetOrmEntity } from './trading-preset.orm-entity.js';

@Injectable()
export class PresetTypeOrmRepository implements PresetRepositoryPort {
  constructor(
    @InjectRepository(TradingPresetOrmEntity)
    private readonly repo: Repository<TradingPresetOrmEntity>,
  ) {}

  async save(preset: PresetRecord): Promise<void> {
    const orm = this.toOrm(preset);
    await this.repo.save(orm);
  }

  async findById(id: string): Promise<PresetRecord | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? this.toRecord(orm) : null;
  }

  async findAll(): Promise<PresetRecord[]> {
    const list = await this.repo.find({ order: { createdAt: 'DESC' } });
    return list.map((o) => this.toRecord(o));
  }

  async findByStatus(status: 'active' | 'paused' | 'archived'): Promise<PresetRecord[]> {
    const list = await this.repo.find({ where: { status }, order: { createdAt: 'DESC' } });
    return list.map((o) => this.toRecord(o));
  }

  private toRecord(orm: TradingPresetOrmEntity): PresetRecord {
    return {
      id: orm.id,
      name: orm.name,
      walletId: orm.walletId,
      status: orm.status,
      initialCapital: Number(orm.initialCapital),
      modelSnapshotId: orm.modelSnapshotId,
      signalThreshold: Number(orm.signalThreshold),
      positionMode: orm.positionMode,
      fixedAmount: Number(orm.fixedAmount),
      positionSizePct: Number(orm.positionSizePct),
      activePairs: Array.isArray(orm.activePairs) ? orm.activePairs : [],
      signalTimeframe: orm.signalTimeframe,
      pollingIntervalMs: orm.pollingIntervalMs,
      cooldownMs: orm.cooldownMs,
      stopLossPct: orm.stopLossPct != null ? Number(orm.stopLossPct) : null,
      takeProfitPct: orm.takeProfitPct != null ? Number(orm.takeProfitPct) : null,
      maxDrawdownPct: orm.maxDrawdownPct != null ? Number(orm.maxDrawdownPct) : null,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    };
  }

  private toOrm(rec: PresetRecord): TradingPresetOrmEntity {
    const orm = new TradingPresetOrmEntity();
    orm.id = rec.id;
    orm.name = rec.name;
    orm.walletId = rec.walletId;
    orm.status = rec.status;
    orm.initialCapital = rec.initialCapital;
    orm.modelSnapshotId = rec.modelSnapshotId;
    orm.signalThreshold = rec.signalThreshold;
    orm.positionMode = rec.positionMode;
    orm.fixedAmount = rec.fixedAmount;
    orm.positionSizePct = rec.positionSizePct;
    orm.activePairs = rec.activePairs;
    orm.signalTimeframe = rec.signalTimeframe;
    orm.pollingIntervalMs = rec.pollingIntervalMs;
    orm.cooldownMs = rec.cooldownMs;
    orm.stopLossPct = rec.stopLossPct;
    orm.takeProfitPct = rec.takeProfitPct;
    orm.maxDrawdownPct = rec.maxDrawdownPct;
    orm.createdAt = rec.createdAt;
    orm.updatedAt = rec.updatedAt;
    return orm;
  }
}
