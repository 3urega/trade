import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { TradeType } from '../enums.js';

export class TradeExecutedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: UniqueEntityId,
    public readonly tradeId: string,
    public readonly pair: string,
    public readonly type: TradeType,
    public readonly amount: number,
    public readonly price: number,
  ) {
    super(aggregateId);
  }
}
