import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ORM entities
import { HistoricalCandleOrmEntity } from './infrastructure/persistence/historical-candle.orm-entity.js';
import { BacktestSessionOrmEntity } from './infrastructure/persistence/backtest-session.orm-entity.js';
import { PredictionOrmEntity } from './infrastructure/persistence/prediction.orm-entity.js';
import { ResearchExperimentOrmEntity } from './infrastructure/persistence/research-experiment.orm-entity.js';

// Repositories
import { CandleTypeOrmRepository } from './infrastructure/persistence/candle-typeorm.repository.js';
import { BacktestTypeOrmRepository } from './infrastructure/persistence/backtest-typeorm.repository.js';
import { PredictionTypeOrmRepository } from './infrastructure/persistence/prediction-typeorm.repository.js';
import { ExperimentTypeOrmRepository } from './infrastructure/persistence/experiment-typeorm.repository.js';

// Adapters
import { BinanceCandleAdapter } from './infrastructure/adapters/binance-candle.adapter.js';
import { PythonMlAdapter } from './infrastructure/adapters/python-ml.adapter.js';

// Application
import { FeatureEngineeringService } from './application/feature-engineering.service.js';
import { LoadHistoricalDataUseCase } from './application/use-cases/load-historical-data.use-case.js';
import { RunBacktestUseCase } from './application/use-cases/run-backtest.use-case.js';
import { GetBacktestUseCase } from './application/use-cases/get-backtest.use-case.js';
import { RunForwardTestUseCase } from './application/use-cases/run-forward-test.use-case.js';
import { RunExperimentUseCase } from './application/use-cases/run-experiment.use-case.js';
import { RunPermutationTestUseCase } from './application/use-cases/run-permutation-test.use-case.js';
import { GetFeatureImportanceUseCase } from './application/use-cases/get-feature-importance.use-case.js';
import { RunParameterSweepUseCase } from './application/use-cases/run-parameter-sweep.use-case.js';
import { RunRollingBacktestUseCase } from './application/use-cases/run-rolling-backtest.use-case.js';
import { ResearchSchedulerService } from './application/research-scheduler.service.js';

// Controller
import { ResearchController } from './infrastructure/http/research.controller.js';

// Port tokens
import { CANDLE_REPOSITORY } from './domain/ports/candle-repository.port.js';
import { BACKTEST_REPOSITORY } from './domain/ports/backtest-repository.port.js';
import { PREDICTION_REPOSITORY } from './domain/ports/prediction-repository.port.js';
import { ML_SERVICE_PORT } from './domain/ports/ml-service.port.js';
import { EXPERIMENT_REPOSITORY } from './domain/ports/experiment-repository.port.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HistoricalCandleOrmEntity,
      BacktestSessionOrmEntity,
      PredictionOrmEntity,
      ResearchExperimentOrmEntity,
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
    RunExperimentUseCase,
    RunPermutationTestUseCase,
    GetFeatureImportanceUseCase,
    RunParameterSweepUseCase,
    RunRollingBacktestUseCase,
    ResearchSchedulerService,
    { provide: EXPERIMENT_REPOSITORY, useClass: ExperimentTypeOrmRepository },
  ],
  exports: [
    { provide: ML_SERVICE_PORT, useClass: PythonMlAdapter },
    { provide: CANDLE_REPOSITORY, useClass: CandleTypeOrmRepository },
    { provide: BACKTEST_REPOSITORY, useClass: BacktestTypeOrmRepository },
    { provide: EXPERIMENT_REPOSITORY, useClass: ExperimentTypeOrmRepository },
    FeatureEngineeringService,
  ],
})
export class ResearchModule {}
