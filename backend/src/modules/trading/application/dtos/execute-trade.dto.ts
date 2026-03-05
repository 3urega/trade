import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive, IsString, IsUUID, IsOptional } from 'class-validator';
import { TradeType } from '../../domain/enums.js';

export class ExecuteTradeDto {
  @ApiProperty({ example: 'BTC', description: 'Base currency (e.g. BTC, ETH, SOL)' })
  @IsString()
  baseCurrency!: string;

  @ApiProperty({ example: 'USDT', description: 'Quote currency (e.g. USDT)' })
  @IsString()
  quoteCurrency!: string;

  @ApiProperty({ enum: TradeType, example: TradeType.BUY })
  @IsEnum(TradeType)
  type!: TradeType;

  @ApiProperty({ example: 0.001, description: 'Amount of base currency to trade' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 65000, description: 'Price in quote currency. If omitted, fetches live price.' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  price?: number;

  @ApiProperty({ example: 'wallet-uuid', description: 'Wallet ID to use for the trade' })
  @IsUUID()
  walletId!: string;
}
