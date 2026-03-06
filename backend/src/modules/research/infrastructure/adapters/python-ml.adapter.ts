import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type { MlServicePort } from '../../domain/ports/ml-service.port.js';
import { FeatureVector } from '../../domain/value-objects/feature-vector.js';
import { ModelType } from '../../domain/enums.js';

@Injectable()
export class PythonMlAdapter implements MlServicePort {
  private readonly logger = new Logger(PythonMlAdapter.name);
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = config.get<string>('ML_ENGINE_URL') ?? 'http://localhost:8000';
    this.client = axios.create({ baseURL, timeout: 30000 });
  }

  async initialize(modelType: ModelType): Promise<void> {
    await this.client.post('/initialize', { model_type: modelType });
    this.logger.log(`ML model initialized: ${modelType}`);
  }

  async partialTrain(x: FeatureVector, y: number): Promise<void> {
    await this.client.post('/partial-train', { features: x.features, target: y });
  }

  async predict(x: FeatureVector): Promise<number> {
    const res = await this.client.post<{ prediction: number }>('/predict', {
      features: x.features,
    });
    return res.data.prediction;
  }

  async saveModel(): Promise<string> {
    const res = await this.client.post<{ model_id: string }>('/save-model');
    this.logger.log(`ML model snapshot saved: ${res.data.model_id}`);
    return res.data.model_id;
  }

  async loadModel(modelId: string): Promise<void> {
    await this.client.post('/load-model', { model_id: modelId });
    this.logger.log(`ML model snapshot loaded: ${modelId}`);
  }

  async initializeEnsemble(): Promise<void> {
    await this.client.post('/initialize-ensemble');
    this.logger.log('ML ensemble initialized');
  }

  async partialTrainEnsemble(x: FeatureVector, y: number): Promise<void> {
    await this.client.post('/partial-train-ensemble', { features: x.features, target: y });
  }

  async predictEnsemble(x: FeatureVector): Promise<number> {
    const res = await this.client.post<{ prediction: number }>('/predict-ensemble', {
      features: x.features,
    });
    return res.data.prediction;
  }

  async saveEnsemble(): Promise<string> {
    const res = await this.client.post<{ model_id: string }>('/save-model-ensemble');
    this.logger.log(`ML ensemble snapshot saved: ${res.data.model_id}`);
    return res.data.model_id;
  }

  async loadEnsemble(modelId: string): Promise<void> {
    await this.client.post('/load-model-ensemble', { model_id: modelId });
    this.logger.log(`ML ensemble snapshot loaded: ${modelId}`);
  }
}
