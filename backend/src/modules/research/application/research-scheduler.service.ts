import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EXPERIMENT_REPOSITORY } from '../domain/ports/experiment-repository.port.js';
import type { ExperimentRepositoryPort } from '../domain/ports/experiment-repository.port.js';
import { RunExperimentUseCase } from './use-cases/run-experiment.use-case.js';

@Injectable()
export class ResearchSchedulerService {
  private readonly logger = new Logger(ResearchSchedulerService.name);

  constructor(
    @Inject(EXPERIMENT_REPOSITORY) private readonly expRepo: ExperimentRepositoryPort,
    private readonly runExperiment: RunExperimentUseCase,
  ) {}

  /** Runs all enabled experiments every day at 02:00 UTC. */
  @Cron('0 2 * * *')
  async handleDailyCron(): Promise<void> {
    this.logger.log('Daily research cron started');
    const experiments = await this.expRepo.findEnabled();

    if (experiments.length === 0) {
      this.logger.log('No enabled experiments — nothing to do');
      return;
    }

    this.logger.log(`Running ${experiments.length} experiment(s) in series`);

    // Run in series: the ML engine keeps a single model in memory,
    // so concurrent runs would corrupt state.
    for (const exp of experiments) {
      try {
        await this.runExperiment.execute(exp.id);
      } catch (err) {
        // RunExperimentUseCase already catches and persists errors;
        // this outer catch prevents one experiment from stopping the rest.
        this.logger.error(`Unhandled error for experiment ${exp.id}: ${String(err)}`);
      }
    }

    this.logger.log('Daily research cron finished');
  }
}
