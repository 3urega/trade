import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExecuteTradeUseCase } from '../../application/use-cases/execute-trade.use-case.js';
import { GetPortfolioUseCase } from '../../application/use-cases/get-portfolio.use-case.js';
import { GetTradesUseCase } from '../../application/use-cases/get-trades.use-case.js';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case.js';
import { TradingSignalService } from '../../application/use-cases/trading-signal.service.js';
import { SimulationService } from '../../application/use-cases/simulation.service.js';
import { TradingConfigService } from '../../application/use-cases/trading-config.service.js';
import { ExecuteTradeDto } from '../../application/dtos/execute-trade.dto.js';
import { TradeResponseDto } from '../../application/dtos/trade-response.dto.js';
import { PortfolioResponseDto } from '../../application/dtos/portfolio-response.dto.js';
import {
  UpdateTradingConfigDto,
  TradingConfigResponseDto,
  AvailableModelDto,
} from '../../application/dtos/trading-config.dto.js';
import { TradingGateway } from '../ws/trading.gateway.js';
import { BACKTEST_REPOSITORY } from '../../../research/domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../../research/domain/ports/backtest-repository.port.js';
import { SessionType } from '../../../research/domain/enums.js';

@ApiTags('trading')
@Controller('v1')
export class TradingController {
  constructor(
    private readonly executeTradeUseCase: ExecuteTradeUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly getTradesUseCase: GetTradesUseCase,
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly tradingSignalService: TradingSignalService,
    private readonly simulationService: SimulationService,
    private readonly tradingConfigService: TradingConfigService,
    private readonly gateway: TradingGateway,
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
  ) {}

  @Get('trading/signal-status')
  @ApiOperation({ summary: 'Get current ML trading signal status' })
  getSignalStatus(): { modelReady: boolean } {
    return { modelReady: this.tradingSignalService.isModelReady };
  }

  @Get('trading/simulation-wallet')
  @ApiOperation({ summary: 'Get the simulation wallet ID' })
  getSimulationWallet(): { walletId: string | null } {
    return { walletId: this.simulationService.getSimulationWalletId() };
  }

  @Get('trading/config')
  @ApiOperation({ summary: 'Get current trading configuration' })
  @ApiResponse({ type: TradingConfigResponseDto })
  getTradingConfig(): TradingConfigResponseDto {
    return this.tradingConfigService.getConfig() as TradingConfigResponseDto;
  }

  @Put('trading/config')
  @ApiOperation({ summary: 'Update trading configuration' })
  @ApiResponse({ type: TradingConfigResponseDto })
  async updateTradingConfig(@Body() dto: UpdateTradingConfigDto): Promise<TradingConfigResponseDto> {
    return this.tradingConfigService.updateConfig(dto) as Promise<TradingConfigResponseDto>;
  }

  @Get('trading/available-models')
  @ApiOperation({ summary: 'List available ML model snapshots with their forward test metrics' })
  @ApiResponse({ type: [AvailableModelDto] })
  async getAvailableModels(): Promise<AvailableModelDto[]> {
    const allSessions = await this.backtestRepo.findAll();

    // Backtest sessions that have a model snapshot
    const backtests = allSessions.filter(
      (s) => s.sessionType === SessionType.BACKTEST && s.modelSnapshotId && s.status === 'COMPLETED' as unknown,
    );

    // Forward tests grouped by sourceSessionId
    const forwardTests = allSessions.filter((s) => s.sessionType === SessionType.FORWARD_TEST);
    const ftBySource = new Map<string, typeof forwardTests>();
    for (const ft of forwardTests) {
      if (!ft.sourceSessionId) continue;
      const existing = ftBySource.get(ft.sourceSessionId) ?? [];
      existing.push(ft);
      ftBySource.set(ft.sourceSessionId, existing);
    }

    return backtests.map((bt): AvailableModelDto => {
      const fts = ftBySource.get(bt.id.value) ?? [];
      return {
        snapshotId: bt.modelSnapshotId!,
        backtestSessionId: bt.id.value,
        symbol: bt.symbol,
        timeframe: bt.timeframe,
        modelType: bt.modelType,
        trainedAt: bt.completedAt?.toISOString() ?? bt.createdAt.toISOString(),
        skillScore: bt.metrics?.skillScore,
        directionalAccuracy: bt.metrics?.directionalAccuracy,
        forwardTests: fts.map((ft) => ({
          sessionId: ft.id.value,
          from: ft.startDate.toISOString(),
          to: ft.endDate.toISOString(),
          initialCapital: ft.tradingMetrics?.initialCapital ?? 0,
          finalCapital: ft.tradingMetrics?.finalCapital ?? 0,
          totalReturn: ft.tradingMetrics?.totalPnl ?? 0,
          totalReturnPct: ft.tradingMetrics?.totalPnlPercent ?? 0,
          totalTrades: ft.tradingMetrics?.totalTrades ?? 0,
          winRate: ft.tradingMetrics?.winRate ?? 0,
          sharpeRatio: ft.tradingMetrics?.sharpeRatio ?? 0,
          maxDrawdown: ft.tradingMetrics?.maxDrawdown ?? 0,
        })),
      };
    });
  }

  @Post('wallets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new paper trading wallet' })
  async createWallet(@Body() body: { ownerId: string; initialUsdtBalance?: number }) {
    return this.createWalletUseCase.execute(body);
  }

  @Post('trades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Execute a simulated trade' })
  @ApiResponse({ type: TradeResponseDto })
  async executeTrade(@Body() dto: ExecuteTradeDto): Promise<TradeResponseDto> {
    const trade = await this.executeTradeUseCase.execute(dto);
    this.gateway.emitTradeExecuted(trade);

    const portfolio = await this.getPortfolioUseCase.execute(dto.walletId);
    this.gateway.emitPortfolioUpdate(portfolio);

    return trade;
  }

  @Get('trades')
  @ApiOperation({ summary: 'List trades (optionally filtered by wallet)' })
  @ApiResponse({ type: [TradeResponseDto] })
  async getTrades(
    @Query('walletId') walletId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<TradeResponseDto[]> {
    return this.getTradesUseCase.execute({ walletId, limit, offset });
  }

  @Get('portfolio/:walletId')
  @ApiOperation({ summary: 'Get portfolio balances and P&L for a wallet' })
  @ApiResponse({ type: PortfolioResponseDto })
  async getPortfolio(@Param('walletId') walletId: string): Promise<PortfolioResponseDto> {
    return this.getPortfolioUseCase.execute(walletId);
  }
}
