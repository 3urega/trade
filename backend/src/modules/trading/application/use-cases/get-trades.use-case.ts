import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '../../../../shared/application/use-case.interface.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import type { TradeRepositoryPort } from '../../domain/ports/trade-repository.port.js';
import { TRADE_REPOSITORY } from '../../domain/ports/trade-repository.port.js';
import { TradeResponseDto } from '../dtos/trade-response.dto.js';

export interface GetTradesRequest {
  walletId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class GetTradesUseCase implements UseCase<GetTradesRequest, TradeResponseDto[]> {
  constructor(
    @Inject(TRADE_REPOSITORY) private readonly tradeRepo: TradeRepositoryPort,
  ) {}

  async execute(request: GetTradesRequest): Promise<TradeResponseDto[]> {
    const trades = request.walletId
      ? await this.tradeRepo.findByWalletId(
          new UniqueEntityId(request.walletId),
          request.limit ?? 50,
        )
      : await this.tradeRepo.findAll(request.limit ?? 50, request.offset ?? 0);

    return trades.map(TradeResponseDto.fromDomain);
  }
}
