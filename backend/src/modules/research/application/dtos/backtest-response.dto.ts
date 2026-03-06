import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BacktestSession } from '../../domain/entities/backtest-session.entity.js';
import { PredictionRecord } from '../../domain/entities/prediction-record.entity.js';
import { BacktestStatus, Timeframe, ModelType, SessionType } from '../../domain/enums.js';
import type { TradingMetrics, SimTrade, EquityPoint } from '../../domain/value-objects/forward-test-result.js';

export class BacktestMetricsResponseDto {
  // Price-space
  @ApiProperty() mae!: number;
  @ApiProperty() mse!: number;
  @ApiProperty() rmse!: number;
  @ApiProperty() mape!: number;

  // Return-space
  @ApiProperty() maeReturn!: number;
  @ApiProperty() rmseReturn!: number;

  // Direction
  @ApiProperty() directionalAccuracy!: number;
  @ApiProperty() totalPredictions!: number;

  // Baseline & finance
  @ApiProperty() maeNaive!: number;
  @ApiProperty() skillScore!: number;
  @ApiProperty() sharpeRatio!: number;
}

export class PredictionRecordResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() timestamp!: Date;
  @ApiProperty() predicted!: number;
  @ApiProperty() actual!: number;
  @ApiProperty() absoluteError!: number;
  @ApiProperty() directionCorrect!: boolean;
}

export class TradingMetricsResponseDto {
  @ApiProperty() initialCapital!: number;
  @ApiProperty() finalCapital!: number;
  @ApiProperty() totalPnl!: number;
  @ApiProperty() totalPnlPercent!: number;
  @ApiProperty() totalTrades!: number;
  @ApiProperty() winningTrades!: number;
  @ApiProperty() losingTrades!: number;
  @ApiProperty() winRate!: number;
  @ApiProperty() maxDrawdown!: number;
  @ApiProperty() maxDrawdownPercent!: number;
  @ApiProperty() sharpeRatio!: number;
  @ApiProperty() trades!: SimTrade[];
  @ApiProperty() equityCurve!: EquityPoint[];
}

export class BacktestSessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty({ enum: Timeframe }) timeframe!: Timeframe;
  @ApiProperty() startDate!: Date;
  @ApiProperty() endDate!: Date;
  @ApiProperty({ enum: ModelType }) modelType!: ModelType;
  @ApiProperty() warmupPeriod!: number;
  @ApiProperty({ enum: BacktestStatus }) status!: BacktestStatus;
  @ApiProperty({ type: BacktestMetricsResponseDto }) metrics!: BacktestMetricsResponseDto;
  @ApiProperty({ enum: SessionType }) sessionType!: SessionType;
  @ApiProperty({ required: false }) modelSnapshotId?: string;
  @ApiProperty({ required: false }) sourceSessionId?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ required: false }) completedAt?: Date;
  @ApiProperty({ required: false }) errorMessage?: string;
  @ApiProperty({ type: [PredictionRecordResponseDto], required: false })
  predictions?: PredictionRecordResponseDto[];
  @ApiPropertyOptional({ type: TradingMetricsResponseDto })
  tradingMetrics?: TradingMetricsResponseDto;
  @ApiPropertyOptional() predictionCorrelation?: number;

  static fromDomain(
    session: BacktestSession,
    predictions?: PredictionRecord[],
  ): BacktestSessionResponseDto {
    const dto = new BacktestSessionResponseDto();
    dto.id = session.id.value;
    dto.symbol = session.symbol;
    dto.timeframe = session.timeframe;
    dto.startDate = session.startDate;
    dto.endDate = session.endDate;
    dto.modelType = session.modelType;
    dto.warmupPeriod = session.warmupPeriod;
    dto.status = session.status;
    dto.metrics = {
      mae: session.metrics.mae,
      mse: session.metrics.mse,
      rmse: session.metrics.rmse,
      mape: session.metrics.mape,
      maeReturn: session.metrics.maeReturn,
      rmseReturn: session.metrics.rmseReturn,
      directionalAccuracy: session.metrics.directionalAccuracy,
      totalPredictions: session.metrics.totalPredictions,
      maeNaive: session.metrics.maeNaive,
      skillScore: session.metrics.skillScore,
      sharpeRatio: session.metrics.sharpeRatio,
    };
    dto.sessionType = session.sessionType;
    dto.modelSnapshotId = session.modelSnapshotId;
    dto.sourceSessionId = session.sourceSessionId;
    dto.createdAt = session.createdAt;
    dto.completedAt = session.completedAt;
    dto.errorMessage = session.errorMessage;
    if (predictions) {
      dto.predictions = predictions.map((p) => ({
        id: p.id.value,
        timestamp: p.timestamp,
        predicted: p.predicted,
        actual: p.actual,
        absoluteError: Math.abs(p.predicted - p.actual),
        directionCorrect: p.directionCorrect,
      }));
    }
    dto.predictionCorrelation = session.predictionCorrelation;
    if (session.tradingMetrics) {
      const tm = session.tradingMetrics;
      dto.tradingMetrics = {
        initialCapital: tm.initialCapital,
        finalCapital: tm.finalCapital,
        totalPnl: tm.totalPnl,
        totalPnlPercent: tm.totalPnlPercent,
        totalTrades: tm.totalTrades,
        winningTrades: tm.winningTrades,
        losingTrades: tm.losingTrades,
        winRate: tm.winRate,
        maxDrawdown: tm.maxDrawdown,
        maxDrawdownPercent: tm.maxDrawdownPercent,
        sharpeRatio: tm.sharpeRatio,
        trades: tm.trades,
        equityCurve: tm.equityCurve,
      };
    }
    return dto;
  }
}

export class ForwardTestResponseDto extends BacktestSessionResponseDto {
  static fromDomain(
    session: BacktestSession,
    tradingMetricsOrPredictions?: TradingMetrics | PredictionRecord[],
    predictions?: PredictionRecord[],
  ): ForwardTestResponseDto {
    let preds: PredictionRecord[] | undefined;

    if (Array.isArray(tradingMetricsOrPredictions)) {
      preds = tradingMetricsOrPredictions;
    } else {
      preds = predictions;
    }

    const base = BacktestSessionResponseDto.fromDomain(session, preds);
    return Object.assign(new ForwardTestResponseDto(), base);
  }
}
