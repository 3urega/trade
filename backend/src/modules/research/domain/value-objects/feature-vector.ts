import { ValueObject } from '../../../../shared/domain/value-object.js';

interface FeatureVectorProps {
  features: number[];
}

export class FeatureVector extends ValueObject<FeatureVectorProps> {
  private constructor(props: FeatureVectorProps) {
    super(props);
  }

  static create(features: number[]): FeatureVector {
    if (features.length === 0) throw new Error('FeatureVector: must have at least one feature');
    if (features.some((f) => !isFinite(f))) throw new Error('FeatureVector: all features must be finite numbers');
    return new FeatureVector({ features: [...features] });
  }

  get features(): number[] { return [...this.props.features]; }
  get length(): number { return this.props.features.length; }
}
