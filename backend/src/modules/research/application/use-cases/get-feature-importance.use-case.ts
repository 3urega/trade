import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { BACKTEST_REPOSITORY } from '../../domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { ML_SERVICE_PORT } from '../../domain/ports/ml-service.port.js';
import type { MlServicePort, FeatureImportanceResult } from '../../domain/ports/ml-service.port.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { ModelType } from '../../domain/enums.js';

@Injectable()
export class GetFeatureImportanceUseCase {
  constructor(
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(ML_SERVICE_PORT) private readonly mlService: MlServicePort,
  ) {}

  async execute(sessionId: string): Promise<FeatureImportanceResult> {
    const session = await this.backtestRepo.findById(new UniqueEntityId(sessionId));
    if (!session) throw new NotFoundException(`Backtest session ${sessionId} not found`);

    if (!session.modelSnapshotId) {
      throw new BadRequestException(
        'This session has no model snapshot. Re-run the backtest to generate one.',
      );
    }

    // Load the snapshot into the ML Engine in-memory state
    const isEnsemble = session.modelType === ModelType.ENSEMBLE;
    if (isEnsemble) {
      await this.mlService.loadEnsemble(session.modelSnapshotId);
    } else {
      await this.mlService.loadModel(session.modelSnapshotId);
    }

    return this.mlService.getFeatureImportance();
  }
}
