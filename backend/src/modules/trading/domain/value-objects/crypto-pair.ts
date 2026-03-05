import { ValueObject } from '../../../../shared/domain/value-object.js';

interface CryptoPairProps {
  base: string;
  quote: string;
}

export class CryptoPair extends ValueObject<CryptoPairProps> {
  private constructor(props: CryptoPairProps) {
    super(props);
  }

  static create(base: string, quote: string): CryptoPair {
    const b = base.trim().toUpperCase();
    const q = quote.trim().toUpperCase();
    if (!b || !q) throw new Error('CryptoPair: base and quote must not be empty');
    return new CryptoPair({ base: b, quote: q });
  }

  static fromSymbol(symbol: string): CryptoPair {
    const parts = symbol.includes('/') ? symbol.split('/') : [symbol.slice(0, -4), symbol.slice(-4)];
    return CryptoPair.create(parts[0], parts[1] ?? 'USDT');
  }

  get base(): string { return this.props.base; }
  get quote(): string { return this.props.quote; }

  toString(): string { return `${this.props.base}/${this.props.quote}`; }
  toSymbol(): string { return `${this.props.base}${this.props.quote}`; }
}
