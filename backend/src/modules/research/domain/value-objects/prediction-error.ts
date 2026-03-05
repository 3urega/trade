import { ValueObject } from '../../../../shared/domain/value-object.js';

interface PredictionErrorProps {
  predicted: number;
  actual: number;
  absoluteError: number;
  squaredError: number;
  directionCorrect: boolean;
}

export class PredictionError extends ValueObject<PredictionErrorProps> {
  private constructor(props: PredictionErrorProps) {
    super(props);
  }

  static from(predicted: number, actual: number, previousClose: number): PredictionError {
    const absoluteError = Math.abs(predicted - actual);
    const squaredError = Math.pow(predicted - actual, 2);
    // Direction: did both predicted and actual move in the same direction vs previous close?
    const predictedDirection = predicted >= previousClose;
    const actualDirection = actual >= previousClose;
    const directionCorrect = predictedDirection === actualDirection;
    return new PredictionError({ predicted, actual, absoluteError, squaredError, directionCorrect });
  }

  get predicted(): number { return this.props.predicted; }
  get actual(): number { return this.props.actual; }
  get absoluteError(): number { return this.props.absoluteError; }
  get squaredError(): number { return this.props.squaredError; }
  get directionCorrect(): boolean { return this.props.directionCorrect; }
}
