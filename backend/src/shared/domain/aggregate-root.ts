import { Entity } from './entity.js';
import { UniqueEntityId } from './unique-entity-id.js';
import { DomainEvent } from './domain-event.js';

export abstract class AggregateRoot<T> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  constructor(props: T, id?: UniqueEntityId) {
    super(props, id);
  }

  get domainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
