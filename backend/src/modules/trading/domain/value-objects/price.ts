import { ValueObject } from '../../../../shared/domain/value-object.js';
import { CryptoPair } from './crypto-pair.js';
import { InvalidPriceError } from '../errors/domain-error.js';

interface PriceProps {
  pair: CryptoPair;
  value: number;
  timestamp: Date;
}

export class Price extends ValueObject<PriceProps> {
  private constructor(props: PriceProps) {
    super(props);
  }

  static create(pair: CryptoPair, value: number, timestamp?: Date): Price {
    if (value <= 0) throw new InvalidPriceError(value);
    return new Price({ pair, value, timestamp: timestamp ?? new Date() });
  }

  get pair(): CryptoPair { return this.props.pair; }
  get value(): number { return this.props.value; }
  get timestamp(): Date { return this.props.timestamp; }

  toString(): string {
    return `${this.props.pair.toString()} @ ${this.props.value} (${this.props.timestamp.toISOString()})`;
  }
}
