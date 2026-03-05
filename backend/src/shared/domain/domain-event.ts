import { UniqueEntityId } from './unique-entity-id.js';

export interface DomainEvent {
  readonly occurredOn: Date;
  readonly aggregateId: UniqueEntityId;
}

export abstract class BaseDomainEvent implements DomainEvent {
  readonly occurredOn: Date;
  readonly aggregateId: UniqueEntityId;

  constructor(aggregateId: UniqueEntityId) {
    this.occurredOn = new Date();
    this.aggregateId = aggregateId;
  }
}
