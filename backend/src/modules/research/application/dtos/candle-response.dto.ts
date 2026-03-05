import { ApiProperty } from '@nestjs/swagger';

export class CandleDatasetSummaryDto {
  @ApiProperty() symbol!: string;
  @ApiProperty() timeframe!: string;
  @ApiProperty() start!: Date;
  @ApiProperty() end!: Date;
  @ApiProperty() count!: number;
}

export class CandleDataDto {
  @ApiProperty({ description: 'Unix timestamp in seconds (compatible with lightweight-charts)' })
  openTime!: number;
  @ApiProperty() open!: number;
  @ApiProperty() high!: number;
  @ApiProperty() low!: number;
  @ApiProperty() close!: number;
  @ApiProperty() volume!: number;
}
