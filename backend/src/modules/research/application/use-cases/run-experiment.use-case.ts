import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EXPERIMENT_REPOSITORY } from '../../domain/ports/experiment-repository.port.js';
import type { ExperimentRepositoryPort } from '../../domain/ports/experiment-repository.port.js';
import { LoadHistoricalDataUseCase } from './load-historical-data.use-case.js';
import { RunBacktestUseCase } from './run-backtest.use-case.js';
import { RunForwardTestUseCase } from './run-forward-test.use-case.js';
import { ModelType, Timeframe } from '../../domain/enums.js';
import type { ResearchExperimentOrmEntity } from '../../infrastructure/persistence/research-experiment.orm-entity.js';

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

@Injectable()
export class RunExperimentUseCase {
  private readonly logger = new Logger(RunExperimentUseCase.name);

  constructor(
    @Inject(EXPERIMENT_REPOSITORY) private readonly expRepo: ExperimentRepositoryPort,
    private readonly loadDataUseCase: LoadHistoricalDataUseCase,
    private readonly runBacktestUseCase: RunBacktestUseCase,
    private readonly runForwardTestUseCase: RunForwardTestUseCase,
  ) {}

  async execute(experimentId: string): Promise<ResearchExperimentOrmEntity> {
    const exp = await this.expRepo.findById(experimentId);
    if (!exp) throw new NotFoundException(`Experiment ${experimentId} not found`);

    const now = new Date();
    const trainFrom = subDays(now, exp.trainWindowDays + exp.forwardWindowDays);
    const trainTo = subDays(now, exp.forwardWindowDays);
    const fwdFrom = trainTo;
    const fwdTo = now;

    exp.lastRunStatus = 'RUNNING';
    exp.lastRunAt = now;
    exp.lastError = null;
    await this.expRepo.save(exp);

    this.logger.log(
      `[${exp.name}] Starting: load ${trainFrom.toISOString().slice(0, 10)} → ${fwdTo.toISOString().slice(0, 10)}, ` +
      `train → ${trainTo.toISOString().slice(0, 10)}, fwd ${fwdFrom.toISOString().slice(0, 10)} → ${fwdTo.toISOString().slice(0, 10)}`,
    );

    try {
      await this.loadDataUseCase.execute({
        symbol: exp.symbol,
        timeframe: exp.timeframe as Timeframe,
        from: trainFrom.toISOString(),
        to: fwdTo.toISOString(),
      });

      const btResult = await this.runBacktestUseCase.execute({
        symbol: exp.symbol,
        timeframe: exp.timeframe as Timeframe,
        from: trainFrom.toISOString(),
        to: trainTo.toISOString(),
        modelType: exp.modelType as ModelType,
        warmupPeriod: exp.warmupPeriod,
      });

      const ftResult = await this.runForwardTestUseCase.execute({
        backtestSessionId: btResult.id,
        from: fwdFrom.toISOString(),
        to: fwdTo.toISOString(),
        initialCapital: Number(exp.initialCapital),
      });

      exp.lastRunStatus = 'SUCCESS';
      exp.lastBacktestSessionId = btResult.id;
      exp.lastForwardSessionId = ftResult.id;
      exp.lastError = null;
      this.logger.log(
        `[${exp.name}] Done: backtest=${btResult.id}, fwd=${ftResult.id}, ` +
        `DA=${btResult.metrics.directionalAccuracy.toFixed(1)}%, ` +
        `P&L=${ftResult.tradingMetrics?.totalPnlPercent?.toFixed(2) ?? 'n/a'}%`,
      );
    } catch (err) {
      exp.lastRunStatus = 'FAILED';
      exp.lastError = String(err);
      this.logger.error(`[${exp.name}] Failed: ${String(err)}`);
    }

    return this.expRepo.save(exp);
  }
}
