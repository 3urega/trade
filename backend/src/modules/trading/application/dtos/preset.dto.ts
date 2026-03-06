import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BalanceEntryDto } from './portfolio-response.dto.js';
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

export class CreatePresetDto {
  @ApiProperty({ example: 'My Strategy', description: 'Preset display name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 10000, description: 'Initial capital in USDT' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  initialCapital?: number;

  @ApiPropertyOptional({ example: 'latest', description: 'Model snapshot ID or "latest"' })
  @IsOptional()
  @IsString()
  modelSnapshotId?: string;

  @ApiPropertyOptional({ example: 0.0005 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  signalThreshold?: number;

  @ApiPropertyOptional({ enum: ['fixed', 'percent'] })
  @IsOptional()
  @IsIn(['fixed', 'percent'])
  positionMode?: 'fixed' | 'percent';

  @ApiPropertyOptional({ example: 0.001 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  fixedAmount?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  @Type(() => Number)
  positionSizePct?: number;

  @ApiPropertyOptional({ example: ['BTC/USDT', 'ETH/USDT'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activePairs?: string[];

  @ApiPropertyOptional({ enum: ['1m', '5m', '15m', '1h'] })
  @IsOptional()
  @IsIn(['1m', '5m', '15m', '1h'])
  signalTimeframe?: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  pollingIntervalMs?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cooldownMs?: number;

  @ApiPropertyOptional({ example: 0.05 })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(1)
  @Type(() => Number)
  stopLossPct?: number | null;

  @ApiPropertyOptional({ example: 0.1 })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(10)
  @Type(() => Number)
  takeProfitPct?: number | null;

  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  @Type(() => Number)
  maxDrawdownPct?: number | null;
}

export class UpdatePresetDto {
  @ApiPropertyOptional({ example: 'My Strategy' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['active', 'paused', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'paused', 'archived'])
  status?: 'active' | 'paused' | 'archived';

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Type(() => Number) initialCapital?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() modelSnapshotId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) signalThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['fixed', 'percent']) positionMode?: 'fixed' | 'percent';
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) fixedAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Max(1) @Type(() => Number) positionSizePct?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) activePairs?: string[];
  @ApiPropertyOptional() @IsOptional() @IsIn(['1m', '5m', '15m', '1h']) signalTimeframe?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1000) @Type(() => Number) pollingIntervalMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) cooldownMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.001) @Max(1) @Type(() => Number) stopLossPct?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.001) @Max(10) @Type(() => Number) takeProfitPct?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Max(1) @Type(() => Number) maxDrawdownPct?: number | null;
}

export class PresetConfigDto {
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

export class PresetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() walletId!: string;
  @ApiProperty({ enum: ['active', 'paused', 'archived'] }) status!: string;
  @ApiProperty() initialCapital!: number;
  @ApiProperty({ type: PresetConfigDto }) config!: PresetConfigDto;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

/** On-the-fly performance metrics for a single preset */
export class PresetMetricsDto {
  @ApiProperty() presetId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['active', 'paused', 'archived'] }) status!: string;
  @ApiProperty() walletId!: string;
  @ApiProperty() initialCapital!: number;
  @ApiProperty() totalValueUsdt!: number;
  @ApiProperty() pnl!: number;
  @ApiProperty() pnlPercent!: number;
  @ApiProperty() totalTrades!: number;
  @ApiProperty() buyTrades!: number;
  @ApiProperty() sellTrades!: number;
  /** Win rate over completed round-trips (BUY→SELL pairs), null when no round-trips yet */
  @ApiPropertyOptional({ nullable: true }) winRate!: number | null;
  /** Maximum observed portfolio drawdown as a fraction (0–1) */
  @ApiProperty() maxDrawdown!: number;
  /** Capital breakdown by currency */
  @ApiProperty({ type: [BalanceEntryDto] }) balances!: BalanceEntryDto[];
  /** Whether the simulation runner is currently active */
  @ApiProperty() isRunning!: boolean;
}
