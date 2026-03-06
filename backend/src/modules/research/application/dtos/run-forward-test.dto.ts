import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsUUID, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
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
}
