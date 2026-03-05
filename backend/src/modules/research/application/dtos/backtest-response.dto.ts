import { ApiProperty } from '@nestjs/swagger';
import { BacktestSession } from '../../domain/entities/backtest-session.entity.js';
import { PredictionRecord } from '../../domain/entities/prediction-record.entity.js';
import { BacktestStatus, Timeframe, ModelType } from '../../domain/enums.js';

export class BacktestMetricsResponseDto {
  @ApiProperty() mae!: number;
  @ApiProperty() mse!: number;
  @ApiProperty() rmse!: number;
  @ApiProperty() directionalAccuracy!: number;
  @ApiProperty() totalPredictions!: number;
}

export class PredictionRecordResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() timestamp!: Date;
  @ApiProperty() predicted!: number;
  @ApiProperty() actual!: number;
  @ApiProperty() absoluteError!: number;
  @ApiProperty() directionCorrect!: boolean;
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
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ required: false }) completedAt?: Date;
  @ApiProperty({ required: false }) errorMessage?: string;
  @ApiProperty({ type: [PredictionRecordResponseDto], required: false })
  predictions?: PredictionRecordResponseDto[];

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
      directionalAccuracy: session.metrics.directionalAccuracy,
      totalPredictions: session.metrics.totalPredictions,
    };
    dto.createdAt = session.createdAt;
    dto.completedAt = session.completedAt;
    dto.errorMessage = session.errorMessage;
    if (predictions) {
      dto.predictions = predictions.map((p) => ({
        id: p.id.value,
        timestamp: p.timestamp,
        predicted: p.predicted,
        actual: p.actual,
        absoluteError: p.absoluteError,
        directionCorrect: p.directionCorrect,
      }));
    }
    return dto;
  }
}
