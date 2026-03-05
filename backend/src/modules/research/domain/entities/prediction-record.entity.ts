import { Entity } from '../../../../shared/domain/entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

interface PredictionRecordProps {
  sessionId: UniqueEntityId;
  timestamp: Date;
  predicted: number;
  actual: number;
  directionCorrect: boolean;
}

export class PredictionRecord extends Entity<PredictionRecordProps> {
  private constructor(props: PredictionRecordProps, id?: UniqueEntityId) {
    super(props, id);
  }

  static create(
    sessionId: UniqueEntityId,
    timestamp: Date,
    predicted: number,
    actual: number,
    directionCorrect: boolean,
    id?: UniqueEntityId,
  ): PredictionRecord {
    return new PredictionRecord(
      { sessionId, timestamp, predicted, actual, directionCorrect },
      id,
    );
  }

  static reconstitute(props: PredictionRecordProps, id: UniqueEntityId): PredictionRecord {
    return new PredictionRecord(props, id);
  }

  get sessionId(): UniqueEntityId { return this.props.sessionId; }
  get timestamp(): Date { return this.props.timestamp; }
  get predicted(): number { return this.props.predicted; }
  get actual(): number { return this.props.actual; }
  // Derived on the fly — not persisted
  get absoluteError(): number { return Math.abs(this.props.predicted - this.props.actual); }
  get directionCorrect(): boolean { return this.props.directionCorrect; }
}
