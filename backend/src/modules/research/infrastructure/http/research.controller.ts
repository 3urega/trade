import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { LoadHistoricalDataUseCase } from '../../application/use-cases/load-historical-data.use-case.js';
import { RunBacktestUseCase } from '../../application/use-cases/run-backtest.use-case.js';
import { GetBacktestUseCase } from '../../application/use-cases/get-backtest.use-case.js';
import { LoadCandlesDto } from '../../application/dtos/load-candles.dto.js';
import { RunBacktestDto } from '../../application/dtos/run-backtest.dto.js';
import { BacktestSessionResponseDto } from '../../application/dtos/backtest-response.dto.js';
import { CandleDatasetSummaryDto, CandleDataDto } from '../../application/dtos/candle-response.dto.js';
import { CANDLE_REPOSITORY } from '../../domain/ports/candle-repository.port.js';
import type { CandleRepositoryPort } from '../../domain/ports/candle-repository.port.js';
import { Timeframe } from '../../domain/enums.js';

@ApiTags('research')
@Controller('v1/research')
export class ResearchController {
  constructor(
    private readonly loadDataUseCase: LoadHistoricalDataUseCase,
    private readonly runBacktestUseCase: RunBacktestUseCase,
    private readonly getBacktestUseCase: GetBacktestUseCase,
    @Inject(CANDLE_REPOSITORY) private readonly candleRepo: CandleRepositoryPort,
  ) {}

  @Get('candles/summary')
  @ApiOperation({ summary: 'Get a summary of all loaded candle datasets (symbol, timeframe, range, count)' })
  @ApiResponse({ type: [CandleDatasetSummaryDto] })
  async getCandleSummary(): Promise<CandleDatasetSummaryDto[]> {
    return this.candleRepo.getSummary();
  }

  @Get('candles')
  @ApiOperation({ summary: 'Get candle data for a symbol/timeframe, with optional date range and limit' })
  @ApiResponse({ type: [CandleDataDto] })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiQuery({ name: 'timeframe', required: true, enum: Timeframe })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: Timeframe,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<CandleDataDto[]> {
    const candles = await this.candleRepo.findBySymbolAndRangeWithLimit(
      symbol,
      timeframe,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      limit ? Number(limit) : 1000,
    );
    return candles.map((c) => ({
      openTime: Math.floor(c.openTime.getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  @Post('candles/load')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Load historical OHLCV candles from Binance into the database' })
  async loadCandles(@Body() dto: LoadCandlesDto) {
    return this.loadDataUseCase.execute(dto);
  }

  @Post('backtest')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Run a walk-forward backtest with online ML training' })
  @ApiResponse({ type: BacktestSessionResponseDto })
  async runBacktest(@Body() dto: RunBacktestDto): Promise<BacktestSessionResponseDto> {
    return this.runBacktestUseCase.execute(dto);
  }

  @Get('backtest')
  @ApiOperation({ summary: 'List all backtest sessions' })
  @ApiResponse({ type: [BacktestSessionResponseDto] })
  async listBacktests(): Promise<BacktestSessionResponseDto[]> {
    return this.getBacktestUseCase.findAll();
  }

  @Get('backtest/:id')
  @ApiOperation({ summary: 'Get a backtest session by ID (optionally with predictions)' })
  @ApiResponse({ type: BacktestSessionResponseDto })
  @ApiQuery({ name: 'predictions', required: false, type: Boolean })
  async getBacktest(
    @Param('id') id: string,
    @Query('predictions') predictions?: boolean,
  ): Promise<BacktestSessionResponseDto> {
    return this.getBacktestUseCase.findById(id, predictions === true || predictions?.toString() === 'true');
  }
}
