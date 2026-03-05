import { ApiProperty } from '@nestjs/swagger';
import { Wallet } from '../../domain/entities/wallet.entity.js';

export class BalanceEntryDto {
  @ApiProperty() currency!: string;
  @ApiProperty() amount!: number;
}

export class PortfolioResponseDto {
  @ApiProperty() walletId!: string;
  @ApiProperty({ type: [BalanceEntryDto] }) balances!: BalanceEntryDto[];
  @ApiProperty() totalValueUsdt!: number;
  @ApiProperty() pnl!: number;
  @ApiProperty() pnlPercent!: number;

  static fromDomain(
    wallet: Wallet,
    currentPrices: Map<string, number>,
    initialCapital = 10000,
  ): PortfolioResponseDto {
    const dto = new PortfolioResponseDto();
    dto.walletId = wallet.id.value;
    dto.balances = Array.from(wallet.getBalances().entries()).map(([currency, amount]) => ({
      currency,
      amount,
    }));
    dto.totalValueUsdt = wallet.calculatePnL(currentPrices).amount;
    dto.pnl = dto.totalValueUsdt - initialCapital;
    dto.pnlPercent = (dto.pnl / initialCapital) * 100;
    return dto;
  }
}
