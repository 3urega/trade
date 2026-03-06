import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, IsUUID } from 'class-validator';

export class RunForwardTestDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the completed BacktestSession whose model will be used' })
  @IsUUID()
  backtestSessionId!: string;

  @ApiProperty({ example: '2024-06-01T00:00:00Z', description: 'Start date of the out-of-sample period' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2024-09-01T00:00:00Z', description: 'End date of the out-of-sample period' })
  @IsDateString()
  to!: string;
}
