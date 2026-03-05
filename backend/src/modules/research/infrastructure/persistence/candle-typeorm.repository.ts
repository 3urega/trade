import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import type { CandleRepositoryPort, CandleDatasetSummary } from '../../domain/ports/candle-repository.port.js';
import { Candle } from '../../domain/value-objects/candle.js';
import { Timeframe } from '../../domain/enums.js';
import { HistoricalCandleOrmEntity } from './historical-candle.orm-entity.js';

@Injectable()
export class CandleTypeOrmRepository implements CandleRepositoryPort {
  constructor(
    @InjectRepository(HistoricalCandleOrmEntity)
    private readonly repo: Repository<HistoricalCandleOrmEntity>,
  ) {}

  async saveBatch(candles: Candle[]): Promise<void> {
    const orms = candles.map((c) => this.toOrm(c));
    // upsert by unique constraint: ignore conflicts (already-loaded candles)
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(HistoricalCandleOrmEntity)
      .values(orms)
      .orIgnore()
      .execute();
  }

  async findBySymbolAndRange(
    symbol: string,
    from: Date,
    to: Date,
    timeframe: Timeframe,
  ): Promise<Candle[]> {
    const orms = await this.repo.find({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe,
        openTime: Between(from, to),
      },
      order: { openTime: 'ASC' },
    });
    return orms.map((o) => this.toDomain(o));
  }

  async findBySymbolAndRangeWithLimit(
    symbol: string,
    timeframe: Timeframe,
    from?: Date,
    to?: Date,
    limit = 1000,
  ): Promise<Candle[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.symbol = :symbol', { symbol: symbol.toUpperCase() })
      .andWhere('c.timeframe = :timeframe', { timeframe })
      .orderBy('c.openTime', 'ASC')
      .take(limit);

    if (from) qb.andWhere('c.openTime >= :from', { from });
    if (to) qb.andWhere('c.openTime <= :to', { to });

    const orms = await qb.getMany();
    return orms.map((o) => this.toDomain(o));
  }

  async countBySymbolAndRange(
    symbol: string,
    from: Date,
    to: Date,
    timeframe: Timeframe,
  ): Promise<number> {
    return this.repo.count({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe,
        openTime: Between(from, to),
      },
    });
  }

  async getSummary(): Promise<CandleDatasetSummary[]> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.symbol', 'symbol')
      .addSelect('c.timeframe', 'timeframe')
      .addSelect('MIN(c.openTime)', 'start')
      .addSelect('MAX(c.openTime)', 'end')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.symbol')
      .addGroupBy('c.timeframe')
      .orderBy('c.symbol', 'ASC')
      .addOrderBy('c.timeframe', 'ASC')
      .getRawMany<{ symbol: string; timeframe: string; start: string; end: string; count: string }>();

    return rows.map((r) => ({
      symbol: r.symbol,
      timeframe: r.timeframe,
      start: new Date(r.start),
      end: new Date(r.end),
      count: Number(r.count),
    }));
  }

  private toOrm(candle: Candle): Partial<HistoricalCandleOrmEntity> {
    return {
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      openTime: candle.openTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    };
  }

  private toDomain(orm: HistoricalCandleOrmEntity): Candle {
    return Candle.create(
      orm.symbol,
      orm.timeframe as Timeframe,
      orm.openTime,
      Number(orm.open),
      Number(orm.high),
      Number(orm.low),
      Number(orm.close),
      Number(orm.volume),
    );
  }
}
