import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { IsString, IsEnum, IsInt, IsBoolean, IsNumber, IsOptional, Min, Max, Length } from 'class-validator';
import { LoadHistoricalDataUseCase } from '../../application/use-cases/load-historical-data.use-case.js';
import { RunBacktestUseCase } from '../../application/use-cases/run-backtest.use-case.js';
import { GetBacktestUseCase } from '../../application/use-cases/get-backtest.use-case.js';
import { RunForwardTestUseCase } from '../../application/use-cases/run-forward-test.use-case.js';
import { RunExperimentUseCase } from '../../application/use-cases/run-experiment.use-case.js';
import { LoadCandlesDto } from '../../application/dtos/load-candles.dto.js';
import { RunBacktestDto } from '../../application/dtos/run-backtest.dto.js';
import { RunForwardTestDto } from '../../application/dtos/run-forward-test.dto.js';
import { BacktestSessionResponseDto } from '../../application/dtos/backtest-response.dto.js';
import { CandleDatasetSummaryDto, CandleDataDto } from '../../application/dtos/candle-response.dto.js';
import { CANDLE_REPOSITORY } from '../../domain/ports/candle-repository.port.js';
import type { CandleRepositoryPort } from '../../domain/ports/candle-repository.port.js';
import { EXPERIMENT_REPOSITORY } from '../../domain/ports/experiment-repository.port.js';
import type { ExperimentRepositoryPort } from '../../domain/ports/experiment-repository.port.js';
import { Timeframe, ModelType } from '../../domain/enums.js';
import type { ResearchExperimentOrmEntity } from '../../infrastructure/persistence/research-experiment.orm-entity.js';

class CreateExperimentDto {
  @IsString() @Length(1, 60) name!: string;
  @IsString() @Length(3, 20) symbol!: string;
  @IsEnum(Timeframe) timeframe!: Timeframe;
  @IsEnum(ModelType) modelType!: ModelType;
  @IsInt() @Min(5) @Max(200) warmupPeriod: number = 20;
  @IsInt() @Min(7) @Max(730) trainWindowDays: number = 90;
  @IsInt() @Min(1) @Max(90) forwardWindowDays: number = 7;
  @IsNumber() @Min(1) initialCapital: number = 10000;
}

class UpdateExperimentDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsString() @Length(3, 20) symbol?: string;
  @IsOptional() @IsEnum(Timeframe) timeframe?: Timeframe;
  @IsOptional() @IsEnum(ModelType) modelType?: ModelType;
  @IsOptional() @IsInt() @Min(5) @Max(200) warmupPeriod?: number;
  @IsOptional() @IsInt() @Min(7) @Max(730) trainWindowDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) forwardWindowDays?: number;
  @IsOptional() @IsNumber() @Min(1) initialCapital?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

@ApiTags('research')
@Controller('v1/research')
export class ResearchController {
  constructor(
    private readonly loadDataUseCase: LoadHistoricalDataUseCase,
    private readonly runBacktestUseCase: RunBacktestUseCase,
    private readonly getBacktestUseCase: GetBacktestUseCase,
    private readonly runForwardTestUseCase: RunForwardTestUseCase,
    private readonly runExperimentUseCase: RunExperimentUseCase,
    @Inject(CANDLE_REPOSITORY) private readonly candleRepo: CandleRepositoryPort,
    @Inject(EXPERIMENT_REPOSITORY) private readonly expRepo: ExperimentRepositoryPort,
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

  @Post('forward-test')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Run a forward (out-of-sample) prediction using a trained backtest model' })
  @ApiResponse({ type: BacktestSessionResponseDto })
  async runForwardTest(@Body() dto: RunForwardTestDto): Promise<BacktestSessionResponseDto> {
    return this.runForwardTestUseCase.execute(dto);
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

  // ---------------------------------------------------------------------------
  // Research Experiments (scheduler)
  // ---------------------------------------------------------------------------

  @Get('experiments')
  @ApiOperation({ summary: 'List all research experiments' })
  async listExperiments(): Promise<ResearchExperimentOrmEntity[]> {
    return this.expRepo.findAll();
  }

  @Post('experiments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a research experiment' })
  async createExperiment(@Body() dto: CreateExperimentDto): Promise<ResearchExperimentOrmEntity> {
    return this.expRepo.save({
      name: dto.name,
      symbol: dto.symbol.toUpperCase(),
      timeframe: dto.timeframe,
      modelType: dto.modelType,
      warmupPeriod: dto.warmupPeriod,
      trainWindowDays: dto.trainWindowDays,
      forwardWindowDays: dto.forwardWindowDays,
      initialCapital: dto.initialCapital,
      enabled: true,
    });
  }

  @Put('experiments/:id')
  @ApiOperation({ summary: 'Update a research experiment' })
  async updateExperiment(
    @Param('id') id: string,
    @Body() dto: UpdateExperimentDto,
  ): Promise<ResearchExperimentOrmEntity> {
    const exp = await this.expRepo.findById(id);
    if (!exp) throw new NotFoundException(`Experiment ${id} not found`);
    return this.expRepo.save({ ...exp, ...dto });
  }

  @Delete('experiments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a research experiment' })
  async deleteExperiment(@Param('id') id: string): Promise<void> {
    await this.expRepo.delete(id);
  }

  @Patch('experiments/:id/toggle')
  @ApiOperation({ summary: 'Toggle enabled/disabled for a research experiment' })
  async toggleExperiment(@Param('id') id: string): Promise<ResearchExperimentOrmEntity> {
    const exp = await this.expRepo.findById(id);
    if (!exp) throw new NotFoundException(`Experiment ${id} not found`);
    return this.expRepo.save({ ...exp, enabled: !exp.enabled });
  }

  @Post('experiments/:id/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a research experiment run' })
  async runExperiment(@Param('id') id: string): Promise<ResearchExperimentOrmEntity> {
    return this.runExperimentUseCase.execute(id);
  }
}
