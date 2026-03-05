import { Entity } from '../../../../shared/domain/entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { Result } from '../../../../shared/domain/result.js';
import { CryptoPair } from '../value-objects/crypto-pair.js';
import { Money } from '../value-objects/money.js';
import { TradeType, TradeStatus } from '../enums.js';
import { InvalidTradeAmountError, InvalidPriceError } from '../errors/domain-error.js';

interface TradeProps {
  walletId: UniqueEntityId;
  pair: CryptoPair;
  type: TradeType;
  amount: number;
  price: Money;
  status: TradeStatus;
  executedAt: Date;
  fee: Money;
}

export class Trade extends Entity<TradeProps> {
  private constructor(props: TradeProps, id?: UniqueEntityId) {
    super(props, id);
  }

  static create(
    walletId: UniqueEntityId,
    pair: CryptoPair,
    type: TradeType,
    amount: number,
    price: Money,
    id?: UniqueEntityId,
  ): Result<Trade, InvalidTradeAmountError | InvalidPriceError> {
    if (amount <= 0) return Result.fail(new InvalidTradeAmountError(amount));
    if (price.amount <= 0) return Result.fail(new InvalidPriceError(price.amount));

    const feeRate = 0.001; // 0.1% default fee
    const feeAmount = price.amount * amount * feeRate;
    const fee = Money.create(feeAmount, price.currency);

    return Result.ok(
      new Trade(
        {
          walletId,
          pair,
          type,
          amount,
          price,
          status: TradeStatus.EXECUTED,
          executedAt: new Date(),
          fee,
        },
        id,
      ),
    );
  }

  get walletId(): UniqueEntityId { return this.props.walletId; }
  get pair(): CryptoPair { return this.props.pair; }
  get type(): TradeType { return this.props.type; }
  get amount(): number { return this.props.amount; }
  get price(): Money { return this.props.price; }
  get status(): TradeStatus { return this.props.status; }
  get executedAt(): Date { return this.props.executedAt; }
  get fee(): Money { return this.props.fee; }

  get totalCost(): Money {
    return this.props.price.multiply(this.props.amount).add(this.props.fee);
  }

  get totalRevenue(): Money {
    return this.props.price.multiply(this.props.amount).subtract(this.props.fee);
  }

  isBuy(): boolean { return this.props.type === TradeType.BUY; }
  isSell(): boolean { return this.props.type === TradeType.SELL; }
}
