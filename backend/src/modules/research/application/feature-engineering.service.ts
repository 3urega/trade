import { Injectable } from '@nestjs/common';
import { Candle } from '../domain/value-objects/candle.js';
import { FeatureVector } from '../domain/value-objects/feature-vector.js';

@Injectable()
export class FeatureEngineeringService {
  /**
   * Build a FeatureVector for the candle at `index` using the full candle array.
   * Requires at least `index >= 5` for all features to be valid.
   *
   * Features (all bounded / relative to avoid scale sensitivity):
   *   0: (high - low) / close       — relative candle range (body+wick size)
   *   1: log return vs prev candle
   *   2: log return vs 5 candles back
   *   3: rolling std of last 5 log-returns (local volatility, already small-scale)
   *   4: volume normalised by max volume in last 5 candles
   */
  build(candles: Candle[], index: number): FeatureVector {
    if (index < 5) {
      throw new Error(`FeatureEngineeringService: index must be >= 5 (got ${index})`);
    }

    const current = candles[index];
    const prev1 = candles[index - 1];
    const prev5 = candles[index - 5];

    // Relative candle range — always in [0, ~0.1] for normal markets
    const relativeRange = (current.high - current.low) / (current.close || 1);

    const logReturn1 = Math.log(current.close / prev1.close);
    const logReturn5 = Math.log(current.close / prev5.close);

    // Volatility as std of last 5 log-returns (already small numbers)
    const logReturns = candles
      .slice(index - 4, index + 1)
      .map((c, j, arr) => (j === 0 ? 0 : Math.log(c.close / arr[j - 1].close)));
    const meanLR = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const varianceLR = logReturns.reduce((s, r) => s + Math.pow(r - meanLR, 2), 0) / logReturns.length;
    const localVolatility = Math.sqrt(varianceLR);

    const lastFiveVolumes = candles.slice(index - 4, index + 1).map((c) => c.volume);
    const maxVolume = Math.max(...lastFiveVolumes);
    const normVolume = maxVolume > 0 ? current.volume / maxVolume : 0;

    return FeatureVector.create([
      relativeRange,
      logReturn1,
      logReturn5,
      localVolatility,
      normVolume,
    ]);
  }
}
