import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export class FundsDepositedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: UniqueEntityId,
    public readonly currency: string,
    public readonly amount: number,
  ) {
    super(aggregateId);
  }
}
