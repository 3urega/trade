import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { BacktestStatus, Timeframe, ModelType, SessionType } from '../enums.js';
import { BacktestMetrics } from '../value-objects/backtest-metrics.js';
import { PredictionError } from '../value-objects/prediction-error.js';
import type { TradingMetrics } from '../value-objects/forward-test-result.js';

interface BacktestSessionProps {
  symbol: string;
  timeframe: Timeframe;
  startDate: Date;
  endDate: Date;
  modelType: ModelType;
  warmupPeriod: number;
  status: BacktestStatus;
  metrics: BacktestMetrics;
  sessionType: SessionType;
  modelSnapshotId?: string;
  sourceSessionId?: string;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  tradingMetrics?: TradingMetrics;
  predictionCorrelation?: number;
}

export class BacktestSession extends AggregateRoot<BacktestSessionProps> {
  private constructor(props: BacktestSessionProps, id?: UniqueEntityId) {
    super(props, id);
  }

  static create(
    symbol: string,
    timeframe: Timeframe,
    startDate: Date,
    endDate: Date,
    modelType: ModelType,
    warmupPeriod = 20,
    id?: UniqueEntityId,
  ): BacktestSession {
    if (startDate >= endDate) throw new Error('BacktestSession: startDate must be before endDate');
    if (warmupPeriod < 1) throw new Error('BacktestSession: warmupPeriod must be at least 1');
    return new BacktestSession(
      {
        symbol: symbol.toUpperCase(),
        timeframe,
        startDate,
        endDate,
        modelType,
        warmupPeriod,
        status: BacktestStatus.CREATED,
        metrics: BacktestMetrics.empty(),
        sessionType: SessionType.BACKTEST,
        createdAt: new Date(),
      },
      id,
    );
  }

  static createForwardTest(
    symbol: string,
    timeframe: Timeframe,
    startDate: Date,
    endDate: Date,
    modelType: ModelType,
    sourceSessionId: string,
    modelSnapshotId: string,
    id?: UniqueEntityId,
  ): BacktestSession {
    if (startDate >= endDate) throw new Error('BacktestSession: startDate must be before endDate');
    return new BacktestSession(
      {
        symbol: symbol.toUpperCase(),
        timeframe,
        startDate,
        endDate,
        modelType,
        warmupPeriod: 0,
        status: BacktestStatus.CREATED,
        metrics: BacktestMetrics.empty(),
        sessionType: SessionType.FORWARD_TEST,
        sourceSessionId,
        modelSnapshotId,
        createdAt: new Date(),
      },
      id,
    );
  }

  static reconstitute(props: BacktestSessionProps, id: UniqueEntityId): BacktestSession {
    return new BacktestSession(props, id);
  }

  get symbol(): string { return this.props.symbol; }
  get timeframe(): Timeframe { return this.props.timeframe; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date { return this.props.endDate; }
  get modelType(): ModelType { return this.props.modelType; }
  get warmupPeriod(): number { return this.props.warmupPeriod; }
  get status(): BacktestStatus { return this.props.status; }
  get metrics(): BacktestMetrics { return this.props.metrics; }
  get sessionType(): SessionType { return this.props.sessionType; }
  get modelSnapshotId(): string | undefined { return this.props.modelSnapshotId; }
  get sourceSessionId(): string | undefined { return this.props.sourceSessionId; }
  get createdAt(): Date { return this.props.createdAt; }
  get completedAt(): Date | undefined { return this.props.completedAt; }
  get errorMessage(): string | undefined { return this.props.errorMessage; }
  get tradingMetrics(): TradingMetrics | undefined { return this.props.tradingMetrics; }
  get predictionCorrelation(): number | undefined { return this.props.predictionCorrelation; }

  setModelSnapshotId(id: string): void {
    this.props.modelSnapshotId = id;
  }

  setTradingMetrics(metrics: TradingMetrics): void {
    this.props.tradingMetrics = metrics;
  }

  setPredictionCorrelation(value: number): void {
    this.props.predictionCorrelation = value;
  }

  start(): void {
    if (this.props.status !== BacktestStatus.CREATED) {
      throw new Error(`BacktestSession: cannot start session in status ${this.props.status}`);
    }
    this.props.status = BacktestStatus.RUNNING;
  }

  registerPrediction(error: PredictionError): void {
    if (this.props.status !== BacktestStatus.RUNNING) {
      throw new Error('BacktestSession: cannot register prediction in a non-running session');
    }
    this.props.metrics = this.props.metrics.register(error);
  }

  complete(): void {
    this.props.status = BacktestStatus.COMPLETED;
    this.props.completedAt = new Date();
  }

  fail(reason: string): void {
    this.props.status = BacktestStatus.FAILED;
    this.props.errorMessage = reason;
    this.props.completedAt = new Date();
  }
}
