import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsString, IsUppercase, Length } from 'class-validator';
import { Timeframe } from '../../domain/enums.js';

export class LoadCandlesDto {
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
}
