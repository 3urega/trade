import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, Length } from 'class-validator';
import { Timeframe, ModelType, PredictionMode } from '../../domain/enums.js';

export class RunBacktestDto {
  @ApiProperty({ example: 'BTCUSDT' })
  @IsString()
  @Length(3, 20)
  symbol!: string;

  @ApiProperty({ enum: Timeframe, example: Timeframe.ONE_HOUR })
  @IsEnum(Timeframe)
  timeframe!: Timeframe;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2024-03-01T00:00:00Z' })
  @IsDateString()
  to!: string;

  @ApiProperty({ enum: ModelType, example: ModelType.SGD_REGRESSOR })
  @IsEnum(ModelType)
  modelType!: ModelType;

  @ApiProperty({ example: 20, description: 'Number of initial candles used only for training (no prediction)' })
  @IsInt()
  @Min(5)
  @Max(200)
  warmupPeriod: number = 20;

  @ApiPropertyOptional({ enum: PredictionMode, example: PredictionMode.RETURN, description: 'RETURN = predict log return (regression), VOLATILITY = predict big move probability (classification)' })
  @IsOptional()
  @IsEnum(PredictionMode)
  predictionMode?: PredictionMode;

  @ApiPropertyOptional({ example: 0.005, description: 'Min price move fraction to classify as big move, e.g. 0.005 = 0.5% (VOLATILITY mode only, default 0.005)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volatilityThreshold?: number;
}
