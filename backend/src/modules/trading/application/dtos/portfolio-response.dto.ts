import { ApiProperty } from '@nestjs/swagger';
import { Wallet } from '../../domain/entities/wallet.entity.js';

export class BalanceEntryDto {
  @ApiProperty() currency!: string;
  @ApiProperty() amount!: number;
  /** Current USDT value of this balance */
  @ApiProperty() valueUsdt!: number;
  /** Percentage of total portfolio value */
  @ApiProperty() pct!: number;
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

    dto.totalValueUsdt = wallet.calculatePnL(currentPrices).amount;
    const total = dto.totalValueUsdt || 1; // avoid division by zero

    dto.balances = Array.from(wallet.getBalances().entries()).map(([currency, amount]) => {
      const valueUsdt = currency === 'USDT' ? amount : amount * (currentPrices.get(currency) ?? 0);
      return {
        currency,
        amount,
        valueUsdt,
        pct: total > 0 ? (valueUsdt / total) * 100 : 0,
      };
    });

    dto.pnl = dto.totalValueUsdt - initialCapital;
    dto.pnlPercent = initialCapital > 0 ? (dto.pnl / initialCapital) * 100 : 0;
    return dto;
  }
}
