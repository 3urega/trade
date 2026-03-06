import { ValueObject } from '../../../../shared/domain/value-object.js';

interface PredictionErrorProps {
  // --- Price space ---
  predicted: number;
  actual: number;
  absoluteError: number;
  squaredError: number;
  absolutePctError: number; // for MAPE; 0 if actual === 0
  naiveAbsoluteError: number; // |previousClose - actual|

  // --- Return space ---
  predictedReturn: number; // log-return predicted by model
  actualReturn: number;    // log(actual / previousClose)
  absoluteErrorReturn: number;
  squaredErrorReturn: number;

  // --- Direction & P&L ---
  directionCorrect: boolean;
  pnl: number; // sign(predictedReturn) * actualReturn (long/short simulation)
}

export class PredictionError extends ValueObject<PredictionErrorProps> {
  private constructor(props: PredictionErrorProps) {
    super(props);
  }

  /**
   * @param predictedPrice  - price predicted by the model (converted from log-return)
   * @param actualPrice     - true next close
   * @param previousClose   - close used as baseline (naive = previousClose)
   * @param predictedLogReturn - raw log-return output from the model
   */
  static from(
    predictedPrice: number,
    actualPrice: number,
    previousClose: number,
    predictedLogReturn: number,
  ): PredictionError {
    // Price-space errors
    const absoluteError = Math.abs(predictedPrice - actualPrice);
    const squaredError = Math.pow(predictedPrice - actualPrice, 2);
    const absolutePctError = actualPrice !== 0 ? Math.abs(predictedPrice - actualPrice) / actualPrice : 0;
    const naiveAbsoluteError = Math.abs(previousClose - actualPrice);

    // Direction (vs previousClose)
    const predictedDirection = predictedPrice >= previousClose;
    const actualDirection = actualPrice >= previousClose;
    const directionCorrect = predictedDirection === actualDirection;

    // Return-space
    const actualReturn = previousClose !== 0 ? Math.log(actualPrice / previousClose) : 0;
    const absoluteErrorReturn = Math.abs(predictedLogReturn - actualReturn);
    const squaredErrorReturn = Math.pow(predictedLogReturn - actualReturn, 2);

    // Simulated P&L: long if predicted positive return, short if negative
    const position = predictedLogReturn >= 0 ? 1 : -1;
    const pnl = position * actualReturn;

    return new PredictionError({
      predicted: predictedPrice,
      actual: actualPrice,
      absoluteError,
      squaredError,
      absolutePctError,
      naiveAbsoluteError,
      predictedReturn: predictedLogReturn,
      actualReturn,
      absoluteErrorReturn,
      squaredErrorReturn,
      directionCorrect,
      pnl,
    });
  }

  get predicted(): number { return this.props.predicted; }
  get actual(): number { return this.props.actual; }
  get absoluteError(): number { return this.props.absoluteError; }
  get squaredError(): number { return this.props.squaredError; }
  get absolutePctError(): number { return this.props.absolutePctError; }
  get naiveAbsoluteError(): number { return this.props.naiveAbsoluteError; }
  get predictedReturn(): number { return this.props.predictedReturn; }
  get actualReturn(): number { return this.props.actualReturn; }
  get absoluteErrorReturn(): number { return this.props.absoluteErrorReturn; }
  get squaredErrorReturn(): number { return this.props.squaredErrorReturn; }
  get directionCorrect(): boolean { return this.props.directionCorrect; }
  get pnl(): number { return this.props.pnl; }
}
