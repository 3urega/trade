import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExecuteTradeUseCase } from '../../application/use-cases/execute-trade.use-case.js';
import { GetPortfolioUseCase } from '../../application/use-cases/get-portfolio.use-case.js';
import { GetTradesUseCase } from '../../application/use-cases/get-trades.use-case.js';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case.js';
import { TradingSignalService } from '../../application/use-cases/trading-signal.service.js';
import { SimulationOrchestrator } from '../../application/use-cases/simulation-orchestrator.service.js';
import { PresetService } from '../../application/use-cases/preset.service.js';
import { ExecuteTradeDto } from '../../application/dtos/execute-trade.dto.js';
import { TradeResponseDto } from '../../application/dtos/trade-response.dto.js';
import { PortfolioResponseDto } from '../../application/dtos/portfolio-response.dto.js';
import type { BalanceEntryDto } from '../../application/dtos/portfolio-response.dto.js';
import {
  UpdateTradingConfigDto,
  TradingConfigResponseDto,
  AvailableModelDto,
} from '../../application/dtos/trading-config.dto.js';
import {
  CreatePresetDto,
  UpdatePresetDto,
  PresetResponseDto,
  PresetMetricsDto,
} from '../../application/dtos/preset.dto.js';
import { TradeType } from '../../domain/enums.js';
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
    private readonly simulationOrchestrator: SimulationOrchestrator,
    private readonly presetService: PresetService,
    private readonly gateway: TradingGateway,
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
  ) {}

  @Get('trading/signal-status')
  @ApiOperation({ summary: 'Get current ML trading signal status' })
  getSignalStatus(): { modelReady: boolean } {
    return { modelReady: this.tradingSignalService.isModelReady };
  }

  @Get('trading/simulation-wallet')
  @ApiOperation({ summary: 'Get the simulation wallet ID (first active preset)' })
  getSimulationWallet(): { walletId: string | null } {
    return { walletId: this.simulationOrchestrator.getSimulationWalletId() };
  }

  @Get('trading/config')
  @ApiOperation({ summary: 'Get current trading configuration (first active preset)' })
  @ApiResponse({ type: TradingConfigResponseDto })
  getTradingConfig(): TradingConfigResponseDto {
    return this.presetService.getConfigForSimulation() as TradingConfigResponseDto;
  }

  @Put('trading/config')
  @ApiOperation({ summary: 'Update trading configuration (first active preset)' })
  @ApiResponse({ type: TradingConfigResponseDto })
  async updateTradingConfig(@Body() dto: UpdateTradingConfigDto): Promise<TradingConfigResponseDto> {
    return this.presetService.updateConfigForSimulation(dto) as Promise<TradingConfigResponseDto>;
  }

  @Post('trading/presets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new trading preset with its wallet' })
  @ApiResponse({ type: PresetResponseDto })
  async createPreset(@Body() dto: CreatePresetDto): Promise<PresetResponseDto> {
    const preset = await this.presetService.create({
      name: dto.name,
      initialCapital: dto.initialCapital,
      config: dto,
    });
    return this.toPresetResponseDto(preset);
  }

  @Get('trading/presets')
  @ApiOperation({ summary: 'List all presets' })
  @ApiResponse({ type: [PresetResponseDto] })
  async getPresets(): Promise<PresetResponseDto[]> {
    const presets = await this.presetService.getAll();
    return presets.map((p) => this.toPresetResponseDto(p));
  }

  @Get('trading/presets/compare')
  @ApiOperation({ summary: 'Compare on-the-fly metrics of all active presets' })
  @ApiResponse({ type: [PresetMetricsDto] })
  async getPresetsCompare(): Promise<PresetMetricsDto[]> {
    const presets = await this.presetService.getActive();
    return Promise.all(presets.map((p) => this.buildPresetMetrics(p.id)));
  }

  @Get('trading/presets/:id/metrics')
  @ApiOperation({ summary: 'On-the-fly performance metrics for a single preset' })
  @ApiResponse({ type: PresetMetricsDto })
  async getPresetMetrics(@Param('id') id: string): Promise<PresetMetricsDto> {
    const preset = await this.presetService.getById(id);
    if (!preset) throw new NotFoundException(`Preset ${id} not found`);
    return this.buildPresetMetrics(id);
  }

  @Get('trading/presets/:id')
  @ApiOperation({ summary: 'Get preset by ID' })
  @ApiResponse({ type: PresetResponseDto })
  async getPreset(@Param('id') id: string): Promise<PresetResponseDto> {
    const preset = await this.presetService.getById(id);
    if (!preset) throw new NotFoundException(`Preset ${id} not found`);
    return this.toPresetResponseDto(preset);
  }

  @Put('trading/presets/:id')
  @ApiOperation({ summary: 'Update preset' })
  @ApiResponse({ type: PresetResponseDto })
  async updatePreset(@Param('id') id: string, @Body() dto: UpdatePresetDto): Promise<PresetResponseDto> {
    const preset = await this.presetService.update(id, {
      name: dto.name,
      status: dto.status,
      modelSnapshotId: dto.modelSnapshotId,
      signalThreshold: dto.signalThreshold,
      positionMode: dto.positionMode,
      fixedAmount: dto.fixedAmount,
      positionSizePct: dto.positionSizePct,
      activePairs: dto.activePairs,
      signalTimeframe: dto.signalTimeframe,
      pollingIntervalMs: dto.pollingIntervalMs,
      cooldownMs: dto.cooldownMs,
      stopLossPct: dto.stopLossPct,
      takeProfitPct: dto.takeProfitPct,
      maxDrawdownPct: dto.maxDrawdownPct,
    });
    return this.toPresetResponseDto(preset);
  }

  @Delete('trading/presets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive preset (soft delete)' })
  async deletePreset(@Param('id') id: string): Promise<void> {
    await this.presetService.archive(id);
  }

  @Post('trading/presets/:id/activate')
  @ApiOperation({ summary: 'Activate preset' })
  @ApiResponse({ type: PresetResponseDto })
  async activatePreset(@Param('id') id: string): Promise<PresetResponseDto> {
    const preset = await this.presetService.activate(id);
    return this.toPresetResponseDto(preset);
  }

  @Post('trading/presets/:id/pause')
  @ApiOperation({ summary: 'Pause preset' })
  @ApiResponse({ type: PresetResponseDto })
  async pausePreset(@Param('id') id: string): Promise<PresetResponseDto> {
    const preset = await this.presetService.pause(id);
    return this.toPresetResponseDto(preset);
  }

  private async buildPresetMetrics(presetId: string): Promise<PresetMetricsDto> {
    const preset = await this.presetService.getById(presetId);
    if (!preset) throw new NotFoundException(`Preset ${presetId} not found`);

    const dto = new PresetMetricsDto();
    dto.presetId = preset.id;
    dto.name = preset.name;
    dto.status = preset.status;
    dto.walletId = preset.walletId;
    dto.initialCapital = preset.initialCapital;
    dto.isRunning = this.simulationOrchestrator.isRunnerActive(preset.id);
    dto.maxDrawdown = this.simulationOrchestrator.getRunnerMaxDrawdown(preset.id);

    try {
      const portfolio = await this.getPortfolioUseCase.execute(
        preset.walletId,
        preset.initialCapital,
      );
      dto.totalValueUsdt = portfolio.totalValueUsdt;
      dto.pnl = portfolio.pnl;
      dto.pnlPercent = portfolio.pnlPercent;
      dto.balances = portfolio.balances as BalanceEntryDto[];
    } catch {
      dto.totalValueUsdt = preset.initialCapital;
      dto.pnl = 0;
      dto.pnlPercent = 0;
      dto.balances = [];
    }

    try {
      const trades = await this.getTradesUseCase.execute({
        walletId: preset.walletId,
        limit: 5000,
      });
      dto.totalTrades = trades.length;
      dto.buyTrades = trades.filter((t) => t.type === TradeType.BUY).length;
      dto.sellTrades = trades.filter((t) => t.type === TradeType.SELL).length;
      dto.winRate = this.computeWinRate(trades);
    } catch {
      dto.totalTrades = 0;
      dto.buyTrades = 0;
      dto.sellTrades = 0;
      dto.winRate = null;
    }

    return dto;
  }

  /**
   * Computes win rate by pairing BUY→SELL round-trips per pair (FIFO order).
   * A round-trip is a win when SELL revenue > BUY cost.
   * Returns null if no completed round-trips exist yet.
   */
  private computeWinRate(trades: TradeResponseDto[]): number | null {
    // Group trades by pair, sorted chronologically
    const byPair = new Map<string, TradeResponseDto[]>();
    for (const t of trades) {
      const list = byPair.get(t.pair) ?? [];
      list.push(t);
      byPair.set(t.pair, list);
    }

    let wins = 0;
    let losses = 0;

    for (const pairTrades of byPair.values()) {
      const sorted = [...pairTrades].sort(
        (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime(),
      );
      const buyQueue: number[] = []; // stores totalCost of each BUY

      for (const trade of sorted) {
        if (trade.type === TradeType.BUY) {
          buyQueue.push(trade.totalCost);
        } else if (trade.type === TradeType.SELL && buyQueue.length > 0) {
          const buyCost = buyQueue.shift()!;
          if (trade.totalCost > buyCost) {
            wins++;
          } else {
            losses++;
          }
        }
      }
    }

    const total = wins + losses;
    return total > 0 ? wins / total : null;
  }

  private toPresetResponseDto(preset: { id: string; name: string; walletId: string; status: string; initialCapital: number; modelSnapshotId: string; signalThreshold: number; positionMode: string; fixedAmount: number; positionSizePct: number; activePairs: string[]; signalTimeframe: string; pollingIntervalMs: number; cooldownMs: number; stopLossPct: number | null; takeProfitPct: number | null; maxDrawdownPct: number | null; createdAt: Date; updatedAt: Date }): PresetResponseDto {
    const dto = new PresetResponseDto();
    dto.id = preset.id;
    dto.name = preset.name;
    dto.walletId = preset.walletId;
    dto.status = preset.status;
    dto.initialCapital = preset.initialCapital;
    dto.config = {
      modelSnapshotId: preset.modelSnapshotId,
      signalThreshold: preset.signalThreshold,
      positionMode: preset.positionMode,
      fixedAmount: preset.fixedAmount,
      positionSizePct: preset.positionSizePct,
      activePairs: preset.activePairs,
      signalTimeframe: preset.signalTimeframe,
      pollingIntervalMs: preset.pollingIntervalMs,
      cooldownMs: preset.cooldownMs,
      stopLossPct: preset.stopLossPct,
      takeProfitPct: preset.takeProfitPct,
      maxDrawdownPct: preset.maxDrawdownPct,
    };
    dto.createdAt = preset.createdAt.toISOString();
    dto.updatedAt = preset.updatedAt.toISOString();
    return dto;
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
