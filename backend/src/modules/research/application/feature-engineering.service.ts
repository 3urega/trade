import { Injectable } from '@nestjs/common';
import { Candle } from '../domain/value-objects/candle.js';
import { FeatureVector } from '../domain/value-objects/feature-vector.js';

@Injectable()
export class FeatureEngineeringService {
  /**
   * Build a FeatureVector for the candle at `index` using the full candle array.
   * Requires at least `index >= 5` for all features to be valid.
   *
   * Features (all normalised to reduce scale sensitivity):
   *   0: close / 1000          (normalised price)
   *   1: log return vs prev candle
   *   2: log return vs 5 candles back
   *   3: rolling std of last 5 closes / close   (relative volatility)
   *   4: volume normalised by max volume in last 5 candles
   */
  build(candles: Candle[], index: number): FeatureVector {
    if (index < 5) {
      throw new Error(`FeatureEngineeringService: index must be >= 5 (got ${index})`);
    }

    const current = candles[index];
    const prev1 = candles[index - 1];
    const prev5 = candles[index - 5];

    const normClose = current.close / 1000;

    const logReturn1 = Math.log(current.close / prev1.close);
    const logReturn5 = Math.log(current.close / prev5.close);

    const lastFiveCloses = candles.slice(index - 4, index + 1).map((c) => c.close);
    const mean = lastFiveCloses.reduce((a, b) => a + b, 0) / lastFiveCloses.length;
    const variance = lastFiveCloses.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / lastFiveCloses.length;
    const relativeVolatility = Math.sqrt(variance) / (current.close || 1);

    const lastFiveVolumes = candles.slice(index - 4, index + 1).map((c) => c.volume);
    const maxVolume = Math.max(...lastFiveVolumes);
    const normVolume = maxVolume > 0 ? current.volume / maxVolume : 0;

    return FeatureVector.create([
      normClose,
      logReturn1,
      logReturn5,
      relativeVolatility,
      normVolume,
    ]);
  }
}
