import { Inject, Injectable, Logger } from '@nestjs/common';
import { CANDLE_REPOSITORY } from '../../domain/ports/candle-repository.port.js';
import type { CandleRepositoryPort } from '../../domain/ports/candle-repository.port.js';
import { BinanceCandleAdapter } from '../../infrastructure/adapters/binance-candle.adapter.js';
import { LoadCandlesDto } from '../dtos/load-candles.dto.js';

export interface LoadCandlesResponse {
  symbol: string;
  timeframe: string;
  from: Date;
  to: Date;
  loaded: number;
}

@Injectable()
export class LoadHistoricalDataUseCase {
  private readonly logger = new Logger(LoadHistoricalDataUseCase.name);

  constructor(
    @Inject(CANDLE_REPOSITORY) private readonly candleRepo: CandleRepositoryPort,
    private readonly binanceCandles: BinanceCandleAdapter,
  ) {}

  async execute(dto: LoadCandlesDto): Promise<LoadCandlesResponse> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    this.logger.log(`Loading ${dto.symbol} ${dto.timeframe} candles from ${dto.from} to ${dto.to}`);

    const candles = await this.binanceCandles.fetchCandles(dto.symbol, dto.timeframe, from, to);
    await this.candleRepo.saveBatch(candles);

    this.logger.log(`Loaded and saved ${candles.length} candles for ${dto.symbol}`);

    return {
      symbol: dto.symbol.toUpperCase(),
      timeframe: dto.timeframe,
      from,
      to,
      loaded: candles.length,
    };
  }
}
