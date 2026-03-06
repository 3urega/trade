export enum BacktestStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum Timeframe {
  ONE_MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  ONE_HOUR = '1h',
  FOUR_HOURS = '4h',
  ONE_DAY = '1d',
}

export enum ModelType {
  SGD_REGRESSOR = 'sgd_regressor',
  PASSIVE_AGGRESSIVE = 'passive_aggressive',
  MLP_REGRESSOR = 'mlp_regressor',
  ENSEMBLE = 'ensemble',
  SGD_CLASSIFIER = 'sgd_classifier',
}

export enum PredictionMode {
  RETURN = 'RETURN',
  VOLATILITY = 'VOLATILITY',
}

export enum SessionType {
  BACKTEST = 'BACKTEST',
  FORWARD_TEST = 'FORWARD_TEST',
}
