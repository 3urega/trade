import { FeatureVector } from '../value-objects/feature-vector.js';
import { ModelType } from '../enums.js';

export const ML_SERVICE_PORT = Symbol('ML_SERVICE_PORT');

export interface MlServicePort {
  initialize(modelType: ModelType): Promise<void>;
  partialTrain(x: FeatureVector, y: number): Promise<void>;
  predict(x: FeatureVector): Promise<number>;
  saveModel(): Promise<string>;
  loadModel(modelId: string): Promise<void>;

  initializeEnsemble(): Promise<void>;
  partialTrainEnsemble(x: FeatureVector, y: number): Promise<void>;
  predictEnsemble(x: FeatureVector): Promise<number>;
  saveEnsemble(): Promise<string>;
  loadEnsemble(modelId: string): Promise<void>;

  partialTrainClassifier(x: FeatureVector, y: number): Promise<void>;
  predictProba(x: FeatureVector): Promise<number>;
}
