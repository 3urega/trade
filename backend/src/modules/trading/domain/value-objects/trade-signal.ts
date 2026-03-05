import { ValueObject } from '../../../../shared/domain/value-object.js';
import { SignalType } from '../enums.js';
import { CryptoPair } from './crypto-pair.js';

interface TradeSignalProps {
  type: SignalType;
  pair: CryptoPair;
  targetPrice: number;
  confidence: number;
  generatedAt: Date;
}

export class TradeSignal extends ValueObject<TradeSignalProps> {
  private constructor(props: TradeSignalProps) {
    super(props);
  }

  static create(
    type: SignalType,
    pair: CryptoPair,
    targetPrice: number,
    confidence = 1.0,
  ): TradeSignal {
    if (confidence < 0 || confidence > 1) throw new Error('Confidence must be between 0 and 1');
    return new TradeSignal({ type, pair, targetPrice, confidence, generatedAt: new Date() });
  }

  get type(): SignalType { return this.props.type; }
  get pair(): CryptoPair { return this.props.pair; }
  get targetPrice(): number { return this.props.targetPrice; }
  get confidence(): number { return this.props.confidence; }
  get generatedAt(): Date { return this.props.generatedAt; }

  isBuy(): boolean { return this.props.type === SignalType.BUY; }
  isSell(): boolean { return this.props.type === SignalType.SELL; }
  isHold(): boolean { return this.props.type === SignalType.HOLD; }
}
