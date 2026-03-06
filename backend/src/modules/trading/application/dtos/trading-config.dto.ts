import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsIn,
  IsArray,
  IsOptional,
  Min,
  Max,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTradingConfigDto {
  @ApiPropertyOptional({ example: 'latest', description: 'Model snapshot ID or "latest"' })
  @IsOptional()
  @IsString()
  modelSnapshotId?: string;

  @ApiPropertyOptional({ example: 0.0005, description: 'Minimum logReturn magnitude to generate a signal' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  signalThreshold?: number;

  @ApiPropertyOptional({ example: 'fixed', enum: ['fixed', 'percent'] })
  @IsOptional()
  @IsIn(['fixed', 'percent'])
  positionMode?: 'fixed' | 'percent';

  @ApiPropertyOptional({ example: 0.001, description: 'Trade amount in base currency (when positionMode=fixed)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  fixedAmount?: number;

  @ApiPropertyOptional({ example: 0.5, description: 'Fraction of available cash per trade (when positionMode=percent)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  @Type(() => Number)
  positionSizePct?: number;

  @ApiPropertyOptional({ example: ['BTC/USDT', 'ETH/USDT'], description: 'Trading pairs to monitor' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activePairs?: string[];

  @ApiPropertyOptional({ example: '5m', enum: ['1m', '5m', '15m', '1h'] })
  @IsOptional()
  @IsIn(['1m', '5m', '15m', '1h'])
  signalTimeframe?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Milliseconds between simulation ticks' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  pollingIntervalMs?: number;

  @ApiPropertyOptional({ example: 0, description: 'Minimum ms between trades on the same pair' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cooldownMs?: number;

  @ApiPropertyOptional({ example: 0.05, description: 'Stop loss as fraction (0.05 = 5%). null = disabled' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(1)
  @Type(() => Number)
  stopLossPct?: number | null;

  @ApiPropertyOptional({ example: 0.1, description: 'Take profit as fraction (0.1 = 10%). null = disabled' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(10)
  @Type(() => Number)
  takeProfitPct?: number | null;

  @ApiPropertyOptional({ example: 0.2, description: 'Max portfolio drawdown fraction before pausing. null = disabled' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  @Type(() => Number)
  maxDrawdownPct?: number | null;
}

export class TradingConfigResponseDto {
  @ApiProperty() modelSnapshotId!: string;
  @ApiProperty() signalThreshold!: number;
  @ApiProperty() positionMode!: string;
  @ApiProperty() fixedAmount!: number;
  @ApiProperty() positionSizePct!: number;
  @ApiProperty({ type: [String] }) activePairs!: string[];
  @ApiProperty() signalTimeframe!: string;
  @ApiProperty() pollingIntervalMs!: number;
  @ApiProperty() cooldownMs!: number;
  @ApiPropertyOptional() stopLossPct!: number | null;
  @ApiPropertyOptional() takeProfitPct!: number | null;
  @ApiPropertyOptional() maxDrawdownPct!: number | null;
}

export class ForwardTestMetricsDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() initialCapital!: number;
  @ApiProperty() finalCapital!: number;
  @ApiProperty() totalReturn!: number;
  @ApiProperty() totalReturnPct!: number;
  @ApiProperty() totalTrades!: number;
  @ApiProperty() winRate!: number;
  @ApiProperty() sharpeRatio!: number;
  @ApiProperty() maxDrawdown!: number;
}

export class AvailableModelDto {
  @ApiProperty() snapshotId!: string;
  @ApiProperty() backtestSessionId!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty() timeframe!: string;
  @ApiProperty() modelType!: string;
  @ApiProperty() trainedAt!: string;
  @ApiPropertyOptional() skillScore?: number;
  @ApiPropertyOptional() directionalAccuracy?: number;
  @ApiProperty({ type: [ForwardTestMetricsDto] }) forwardTests!: ForwardTestMetricsDto[];
}
