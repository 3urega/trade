import { Entity } from '../../../../shared/domain/entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

interface PredictionRecordProps {
  sessionId: UniqueEntityId;
  timestamp: Date;
  predicted: number;
  actual: number;
  absoluteError: number;
  squaredError: number;
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
    absoluteError: number,
    squaredError: number,
    directionCorrect: boolean,
    id?: UniqueEntityId,
  ): PredictionRecord {
    return new PredictionRecord(
      { sessionId, timestamp, predicted, actual, absoluteError, squaredError, directionCorrect },
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
  get absoluteError(): number { return this.props.absoluteError; }
  get squaredError(): number { return this.props.squaredError; }
  get directionCorrect(): boolean { return this.props.directionCorrect; }
}
