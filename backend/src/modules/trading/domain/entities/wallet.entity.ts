import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { Result } from '../../../../shared/domain/result.js';
import { Money } from '../value-objects/money.js';
import { Trade } from './trade.entity.js';
import { TradeType } from '../enums.js';
import { InsufficientFundsError } from '../errors/domain-error.js';
import { FundsDepositedEvent } from '../events/funds-deposited.event.js';
import { TradeExecutedEvent } from '../events/trade-executed.event.js';

interface WalletProps {
  ownerId: string;
  balances: Map<string, number>;
  createdAt: Date;
}

export class Wallet extends AggregateRoot<WalletProps> {
  private constructor(props: WalletProps, id?: UniqueEntityId) {
    super(props, id);
  }

  static create(ownerId: string, initialBalances?: Map<string, number>, id?: UniqueEntityId): Wallet {
    return new Wallet(
      {
        ownerId,
        balances: initialBalances ?? new Map([['USDT', 10000]]),
        createdAt: new Date(),
      },
      id,
    );
  }

  static reconstitute(props: WalletProps, id: UniqueEntityId): Wallet {
    return new Wallet(props, id);
  }

  get ownerId(): string { return this.props.ownerId; }
  get createdAt(): Date { return this.props.createdAt; }

  getBalance(currency: string): number {
    return this.props.balances.get(currency.toUpperCase()) ?? 0;
  }

  getBalances(): Map<string, number> {
    return new Map(this.props.balances);
  }

  deposit(amount: number, currency: string): void {
    const cur = currency.toUpperCase();
    const current = this.getBalance(cur);
    this.props.balances.set(cur, current + amount);
    this.addDomainEvent(new FundsDepositedEvent(this._id, cur, amount));
  }

  applyTrade(trade: Trade): Result<void, InsufficientFundsError> {
    if (trade.type === TradeType.BUY) {
      const cost = trade.totalCost.amount;
      const quote = trade.pair.quote;
      if (this.getBalance(quote) < cost) {
        return Result.fail(new InsufficientFundsError(cost, this.getBalance(quote), quote));
      }
      this.props.balances.set(quote, this.getBalance(quote) - cost);
      this.props.balances.set(trade.pair.base, this.getBalance(trade.pair.base) + trade.amount);
    } else {
      const base = trade.pair.base;
      if (this.getBalance(base) < trade.amount) {
        return Result.fail(new InsufficientFundsError(trade.amount, this.getBalance(base), base));
      }
      this.props.balances.set(base, this.getBalance(base) - trade.amount);
      this.props.balances.set(trade.pair.quote, this.getBalance(trade.pair.quote) + trade.totalRevenue.amount);
    }

    this.addDomainEvent(
      new TradeExecutedEvent(
        this._id,
        trade.id.value,
        trade.pair.toString(),
        trade.type,
        trade.amount,
        trade.price.amount,
      ),
    );

    return Result.ok();
  }

  calculatePnL(currentPrices: Map<string, number>, baseCurrency = 'USDT'): Money {
    let total = this.getBalance(baseCurrency);
    for (const [currency, balance] of this.props.balances) {
      if (currency === baseCurrency) continue;
      const price = currentPrices.get(currency) ?? 0;
      total += balance * price;
    }
    return Money.create(total, baseCurrency);
  }
}
