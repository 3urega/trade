import { ValueObject } from '../../../../shared/domain/value-object.js';
import { Timeframe } from '../enums.js';

interface CandleProps {
  symbol: string;
  timeframe: Timeframe;
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class Candle extends ValueObject<CandleProps> {
  private constructor(props: CandleProps) {
    super(props);
  }

  static create(
    symbol: string,
    timeframe: Timeframe,
    openTime: Date,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number,
  ): Candle {
    if (!symbol.trim()) throw new Error('Candle: symbol must not be empty');
    if (close <= 0 || open <= 0 || high <= 0 || low <= 0) throw new Error('Candle: prices must be positive');
    if (high < low) throw new Error('Candle: high must be >= low');
    return new Candle({ symbol: symbol.toUpperCase(), timeframe, openTime, open, high, low, close, volume });
  }

  get symbol(): string { return this.props.symbol; }
  get timeframe(): Timeframe { return this.props.timeframe; }
  get openTime(): Date { return this.props.openTime; }
  get open(): number { return this.props.open; }
  get high(): number { return this.props.high; }
  get low(): number { return this.props.low; }
  get close(): number { return this.props.close; }
  get volume(): number { return this.props.volume; }

  return1(): number {
    return (this.props.close - this.props.open) / this.props.open;
  }
}
