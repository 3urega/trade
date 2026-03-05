import { ValueObject } from '../../../../shared/domain/value-object.js';
import { PredictionError } from './prediction-error.js';

interface BacktestMetricsProps {
  totalPredictions: number;
  sumAbsoluteError: number;
  sumSquaredError: number;
  correctDirections: number;
}

export class BacktestMetrics extends ValueObject<BacktestMetricsProps> {
  private constructor(props: BacktestMetricsProps) {
    super(props);
  }

  static empty(): BacktestMetrics {
    return new BacktestMetrics({
      totalPredictions: 0,
      sumAbsoluteError: 0,
      sumSquaredError: 0,
      correctDirections: 0,
    });
  }

  static reconstitute(props: BacktestMetricsProps): BacktestMetrics {
    return new BacktestMetrics(props);
  }

  register(error: PredictionError): BacktestMetrics {
    return new BacktestMetrics({
      totalPredictions: this.props.totalPredictions + 1,
      sumAbsoluteError: this.props.sumAbsoluteError + error.absoluteError,
      sumSquaredError: this.props.sumSquaredError + error.squaredError,
      correctDirections: this.props.correctDirections + (error.directionCorrect ? 1 : 0),
    });
  }

  get totalPredictions(): number { return this.props.totalPredictions; }
  get sumAbsoluteError(): number { return this.props.sumAbsoluteError; }
  get sumSquaredError(): number { return this.props.sumSquaredError; }
  get correctDirections(): number { return this.props.correctDirections; }

  get mae(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumAbsoluteError / this.props.totalPredictions;
  }

  get mse(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumSquaredError / this.props.totalPredictions;
  }

  get rmse(): number {
    return Math.sqrt(this.mse);
  }

  get directionalAccuracy(): number {
    if (this.props.totalPredictions === 0) return 0;
    return (this.props.correctDirections / this.props.totalPredictions) * 100;
  }

  toSnapshot(): BacktestMetricsProps {
    return { ...this.props };
  }
}
