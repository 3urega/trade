import { FeatureVector } from '../value-objects/feature-vector.js';
import { ModelType } from '../enums.js';

export const ML_SERVICE_PORT = Symbol('ML_SERVICE_PORT');

export interface MlServicePort {
  initialize(modelType: ModelType): Promise<void>;
  partialTrain(x: FeatureVector, y: number): Promise<void>;
  predict(x: FeatureVector): Promise<number>;
}
