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
}
