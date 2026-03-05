import { ApiProperty } from '@nestjs/swagger';
import { TradeType, TradeStatus } from '../../domain/enums.js';
import { Trade } from '../../domain/entities/trade.entity.js';

export class TradeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() walletId!: string;
  @ApiProperty() pair!: string;
  @ApiProperty({ enum: TradeType }) type!: TradeType;
  @ApiProperty() amount!: number;
  @ApiProperty() price!: number;
  @ApiProperty() fee!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty({ enum: TradeStatus }) status!: TradeStatus;
  @ApiProperty() executedAt!: Date;

  static fromDomain(trade: Trade): TradeResponseDto {
    const dto = new TradeResponseDto();
    dto.id = trade.id.value;
    dto.walletId = trade.walletId.value;
    dto.pair = trade.pair.toString();
    dto.type = trade.type;
    dto.amount = trade.amount;
    dto.price = trade.price.amount;
    dto.fee = trade.fee.amount;
    dto.totalCost = trade.isBuy() ? trade.totalCost.amount : trade.totalRevenue.amount;
    dto.status = trade.status;
    dto.executedAt = trade.executedAt;
    return dto;
  }
}
