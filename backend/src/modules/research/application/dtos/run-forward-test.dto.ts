import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsUUID, IsOptional, IsNumber, Min, IsBoolean, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class RunForwardTestDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the completed BacktestSession whose model will be used' })
  @IsUUID()
  backtestSessionId!: string;

  @ApiProperty({ example: '2024-06-01T00:00:00Z', description: 'Start date of the simulation period' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2024-09-01T00:00:00Z', description: 'End date of the simulation period' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ example: 10000, description: 'Initial capital in USDT for the trading simulation' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  initialCapital?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'If true, allows simulating on dates within the backtest training period (in-sample)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allowInSample?: boolean;

  @ApiPropertyOptional({ example: 0.0005, description: 'Min predicted return magnitude to open a trade (default 0.0005)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  signalThreshold?: number;

  @ApiPropertyOptional({ example: 0.001, description: 'Fee rate per trade, e.g. 0.001 = 0.1% (default 0.001)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeRate?: number;

  @ApiPropertyOptional({ example: 0.5, description: 'Fraction of available capital to invest per trade, 0–1 (default 0.5)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  positionSizePct?: number;

  @ApiPropertyOptional({ example: 2, description: 'Stop loss distance in multiples of local volatility (default 2)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  slMultiplier?: number;

  @ApiPropertyOptional({ example: 3, description: 'Take profit distance in multiples of local volatility (default 3)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tpMultiplier?: number;
}
