import { ValueObject } from '../../../../shared/domain/value-object.js';

interface MoneyProps {
  amount: number;
  currency: string;
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static create(amount: number, currency: string): Money {
    if (!isFinite(amount)) throw new Error('Money: amount must be a finite number');
    return new Money({ amount, currency: currency.toUpperCase() });
  }

  static zero(currency: string): Money {
    return new Money({ amount: 0, currency: currency.toUpperCase() });
  }

  get amount(): number { return this.props.amount; }
  get currency(): string { return this.props.currency; }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money({ amount: this.props.amount + other.props.amount, currency: this.props.currency });
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money({ amount: this.props.amount - other.props.amount, currency: this.props.currency });
  }

  multiply(factor: number): Money {
    return new Money({ amount: this.props.amount * factor, currency: this.props.currency });
  }

  isGreaterThanOrEqualTo(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.props.amount >= other.props.amount;
  }

  isPositive(): boolean { return this.props.amount > 0; }
  isNegative(): boolean { return this.props.amount < 0; }

  private assertSameCurrency(other: Money): void {
    if (this.props.currency !== other.props.currency) {
      throw new Error(`Currency mismatch: ${this.props.currency} vs ${other.props.currency}`);
    }
  }

  toString(): string { return `${this.props.amount} ${this.props.currency}`; }
}
