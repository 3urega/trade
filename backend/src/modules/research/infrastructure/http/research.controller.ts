import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { LoadHistoricalDataUseCase } from '../../application/use-cases/load-historical-data.use-case.js';
import { RunBacktestUseCase } from '../../application/use-cases/run-backtest.use-case.js';
import { GetBacktestUseCase } from '../../application/use-cases/get-backtest.use-case.js';
import { LoadCandlesDto } from '../../application/dtos/load-candles.dto.js';
import { RunBacktestDto } from '../../application/dtos/run-backtest.dto.js';
import { BacktestSessionResponseDto } from '../../application/dtos/backtest-response.dto.js';

@ApiTags('research')
@Controller('v1/research')
export class ResearchController {
  constructor(
    private readonly loadDataUseCase: LoadHistoricalDataUseCase,
    private readonly runBacktestUseCase: RunBacktestUseCase,
    private readonly getBacktestUseCase: GetBacktestUseCase,
  ) {}

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
