import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ORM entities
import { HistoricalCandleOrmEntity } from './infrastructure/persistence/historical-candle.orm-entity.js';
import { BacktestSessionOrmEntity } from './infrastructure/persistence/backtest-session.orm-entity.js';
import { PredictionOrmEntity } from './infrastructure/persistence/prediction.orm-entity.js';

// Repositories
import { CandleTypeOrmRepository } from './infrastructure/persistence/candle-typeorm.repository.js';
import { BacktestTypeOrmRepository } from './infrastructure/persistence/backtest-typeorm.repository.js';
import { PredictionTypeOrmRepository } from './infrastructure/persistence/prediction-typeorm.repository.js';

// Adapters
import { BinanceCandleAdapter } from './infrastructure/adapters/binance-candle.adapter.js';
import { PythonMlAdapter } from './infrastructure/adapters/python-ml.adapter.js';

// Application
import { FeatureEngineeringService } from './application/feature-engineering.service.js';
import { LoadHistoricalDataUseCase } from './application/use-cases/load-historical-data.use-case.js';
import { RunBacktestUseCase } from './application/use-cases/run-backtest.use-case.js';
import { GetBacktestUseCase } from './application/use-cases/get-backtest.use-case.js';
import { RunForwardTestUseCase } from './application/use-cases/run-forward-test.use-case.js';

// Controller
import { ResearchController } from './infrastructure/http/research.controller.js';

// Port tokens
import { CANDLE_REPOSITORY } from './domain/ports/candle-repository.port.js';
import { BACKTEST_REPOSITORY } from './domain/ports/backtest-repository.port.js';
import { PREDICTION_REPOSITORY } from './domain/ports/prediction-repository.port.js';
import { ML_SERVICE_PORT } from './domain/ports/ml-service.port.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HistoricalCandleOrmEntity,
      BacktestSessionOrmEntity,
      PredictionOrmEntity,
    ]),
  ],
  controllers: [ResearchController],
  providers: [
    // Repository bindings
    { provide: CANDLE_REPOSITORY, useClass: CandleTypeOrmRepository },
    { provide: BACKTEST_REPOSITORY, useClass: BacktestTypeOrmRepository },
    { provide: PREDICTION_REPOSITORY, useClass: PredictionTypeOrmRepository },

    // Adapter bindings
    { provide: ML_SERVICE_PORT, useClass: PythonMlAdapter },
    BinanceCandleAdapter,

    // Application services
    FeatureEngineeringService,
    LoadHistoricalDataUseCase,
    RunBacktestUseCase,
    GetBacktestUseCase,
    RunForwardTestUseCase,
  ],
  exports: [
    { provide: ML_SERVICE_PORT, useClass: PythonMlAdapter },
    { provide: CANDLE_REPOSITORY, useClass: CandleTypeOrmRepository },
    { provide: BACKTEST_REPOSITORY, useClass: BacktestTypeOrmRepository },
    FeatureEngineeringService,
  ],
})
export class ResearchModule {}
