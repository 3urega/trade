import { ValueObject } from '../../../../shared/domain/value-object.js';
import { PredictionError } from './prediction-error.js';

interface BacktestMetricsProps {
  totalPredictions: number;

  // Price space
  sumAbsoluteError: number;
  sumSquaredError: number;
  sumAbsolutePctError: number;
  mapeCount: number; // points with actual !== 0

  // Return space
  sumAbsoluteErrorReturn: number;
  sumSquaredErrorReturn: number;

  // Direction
  correctDirections: number;

  // Naive baseline
  sumNaiveAbsoluteError: number;

  // Simulated P&L (long/short by predicted direction)
  sumPnl: number;
  sumPnlSquared: number;
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
      sumAbsolutePctError: 0,
      mapeCount: 0,
      sumAbsoluteErrorReturn: 0,
      sumSquaredErrorReturn: 0,
      correctDirections: 0,
      sumNaiveAbsoluteError: 0,
      sumPnl: 0,
      sumPnlSquared: 0,
    });
  }

  /**
   * Reconstitute from a persisted JSONB snapshot.
   * New fields default to 0 for backward compatibility with old sessions.
   */
  static reconstitute(raw: Record<string, number>): BacktestMetrics {
    return new BacktestMetrics({
      totalPredictions: raw['totalPredictions'] ?? 0,
      sumAbsoluteError: raw['sumAbsoluteError'] ?? 0,
      sumSquaredError: raw['sumSquaredError'] ?? 0,
      sumAbsolutePctError: raw['sumAbsolutePctError'] ?? 0,
      mapeCount: raw['mapeCount'] ?? 0,
      sumAbsoluteErrorReturn: raw['sumAbsoluteErrorReturn'] ?? 0,
      sumSquaredErrorReturn: raw['sumSquaredErrorReturn'] ?? 0,
      correctDirections: raw['correctDirections'] ?? 0,
      sumNaiveAbsoluteError: raw['sumNaiveAbsoluteError'] ?? 0,
      sumPnl: raw['sumPnl'] ?? 0,
      sumPnlSquared: raw['sumPnlSquared'] ?? 0,
    });
  }

  register(error: PredictionError): BacktestMetrics {
    return new BacktestMetrics({
      totalPredictions: this.props.totalPredictions + 1,
      sumAbsoluteError: this.props.sumAbsoluteError + error.absoluteError,
      sumSquaredError: this.props.sumSquaredError + error.squaredError,
      sumAbsolutePctError: this.props.sumAbsolutePctError + error.absolutePctError,
      mapeCount: this.props.mapeCount + (error.actual !== 0 ? 1 : 0),
      sumAbsoluteErrorReturn: this.props.sumAbsoluteErrorReturn + error.absoluteErrorReturn,
      sumSquaredErrorReturn: this.props.sumSquaredErrorReturn + error.squaredErrorReturn,
      correctDirections: this.props.correctDirections + (error.directionCorrect ? 1 : 0),
      sumNaiveAbsoluteError: this.props.sumNaiveAbsoluteError + error.naiveAbsoluteError,
      sumPnl: this.props.sumPnl + error.pnl,
      sumPnlSquared: this.props.sumPnlSquared + error.pnl * error.pnl,
    });
  }

  // ---------------------------------------------------------------------------
  // Price-space getters
  // ---------------------------------------------------------------------------

  get totalPredictions(): number { return this.props.totalPredictions; }

  get mae(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumAbsoluteError / this.props.totalPredictions;
  }

  get mse(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumSquaredError / this.props.totalPredictions;
  }

  get rmse(): number { return Math.sqrt(this.mse); }

  /** Mean Absolute Percentage Error (%) */
  get mape(): number {
    if (this.props.mapeCount === 0) return 0;
    return (this.props.sumAbsolutePctError / this.props.mapeCount) * 100;
  }

  // ---------------------------------------------------------------------------
  // Return-space getters
  // ---------------------------------------------------------------------------

  get maeReturn(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumAbsoluteErrorReturn / this.props.totalPredictions;
  }

  get mseReturn(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumSquaredErrorReturn / this.props.totalPredictions;
  }

  get rmseReturn(): number { return Math.sqrt(this.mseReturn); }

  // ---------------------------------------------------------------------------
  // Direction
  // ---------------------------------------------------------------------------

  get directionalAccuracy(): number {
    if (this.props.totalPredictions === 0) return 0;
    return (this.props.correctDirections / this.props.totalPredictions) * 100;
  }

  // ---------------------------------------------------------------------------
  // Naive baseline & skill score
  // ---------------------------------------------------------------------------

  get maeNaive(): number {
    if (this.props.totalPredictions === 0) return 0;
    return this.props.sumNaiveAbsoluteError / this.props.totalPredictions;
  }

  /**
   * Skill Score: 1 - (MAE_model / MAE_naive)
   *  > 0 → better than naive
   *  = 0 → same as naive
   *  < 0 → worse than naive
   */
  get skillScore(): number {
    if (this.maeNaive === 0) return 0;
    return 1 - this.mae / this.maeNaive;
  }

  // ---------------------------------------------------------------------------
  // Sharpe ratio (return-based, non-annualised)
  // ---------------------------------------------------------------------------

  /**
   * Sharpe = mean(pnl) / std(pnl).
   * Uses population std. Returns 0 if std === 0 or totalPredictions < 2.
   */
  get sharpeRatio(): number {
    const n = this.props.totalPredictions;
    if (n < 2) return 0;
    const meanPnl = this.props.sumPnl / n;
    const variance = this.props.sumPnlSquared / n - meanPnl * meanPnl;
    const std = Math.sqrt(Math.max(0, variance));
    if (std === 0) return 0;
    return meanPnl / std;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  toSnapshot(): Record<string, number> {
    return { ...this.props };
  }
}
