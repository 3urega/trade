import { Injectable } from '@nestjs/common';
import { Candle } from '../domain/value-objects/candle.js';
import { FeatureVector } from '../domain/value-objects/feature-vector.js';

const MIN_INDEX = 26;

@Injectable()
export class FeatureEngineeringService {
  /**
   * Build a FeatureVector for the candle at `index`.
   * Requires index >= 26 (for EMA-26 and Bollinger-20 lookback).
   *
   * Features (14 total, all bounded / relative — no absolute prices):
   *   0: relative_range        (high - low) / close
   *   1: log_return_1          log(close / close[-1])
   *   2: log_return_5          log(close / close[-5])
   *   3: local_volatility      std of last 5 log-returns
   *   4: norm_volume           volume / max(last 5 volumes)
   *   5: rsi_14                RSI over 14 periods, scaled to [0,1]
   *   6: ema_ratio_short       close / EMA(9) - 1
   *   7: ema_ratio_long        close / EMA(21) - 1
   *   8: macd_norm             (EMA(12) - EMA(26)) / close
   *   9: bb_position           (close - BB_lower) / (BB_upper - BB_lower)
   *  10: log_return_10         log(close / close[-10])
   *  11: log_return_20         log(close / close[-20])
   *  12: volume_ratio          volume / SMA(volume, 20)
   *  13: body_ratio            (close - open) / (high - low)
   */
  build(candles: Candle[], index: number): FeatureVector {
    if (index < MIN_INDEX) {
      throw new Error(`FeatureEngineeringService: index must be >= ${MIN_INDEX} (got ${index})`);
    }

    const current = candles[index];

    // --- Original 5 features ---
    const relativeRange = (current.high - current.low) / (current.close || 1);
    const logReturn1 = Math.log(current.close / candles[index - 1].close);
    const logReturn5 = Math.log(current.close / candles[index - 5].close);

    const recentReturns = candles
      .slice(index - 4, index + 1)
      .map((c, j, arr) => (j === 0 ? 0 : Math.log(c.close / arr[j - 1].close)));
    const meanLR = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const varianceLR = recentReturns.reduce((s, r) => s + (r - meanLR) ** 2, 0) / recentReturns.length;
    const localVolatility = Math.sqrt(varianceLR);

    const lastFiveVols = candles.slice(index - 4, index + 1).map((c) => c.volume);
    const maxVol = Math.max(...lastFiveVols);
    const normVolume = maxVol > 0 ? current.volume / maxVol : 0;

    // --- New features ---
    const rsi14 = this.rsi(candles, 14, index) / 100;

    const ema9 = this.ema(candles, 9, index);
    const ema21 = this.ema(candles, 21, index);
    const emaRatioShort = current.close / ema9 - 1;
    const emaRatioLong = current.close / ema21 - 1;

    const ema12 = this.ema(candles, 12, index);
    const ema26 = this.ema(candles, 26, index);
    const macdNorm = (ema12 - ema26) / (current.close || 1);

    const { upper, lower } = this.bollingerBands(candles, 20, index);
    const bbWidth = upper - lower;
    const bbPosition = bbWidth > 0 ? (current.close - lower) / bbWidth : 0.5;

    const logReturn10 = Math.log(current.close / candles[index - 10].close);
    const logReturn20 = Math.log(current.close / candles[index - 20].close);

    const volSlice = candles.slice(index - 19, index + 1).map((c) => c.volume);
    const smaVol20 = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
    const volumeRatio = smaVol20 > 0 ? current.volume / smaVol20 : 0;

    const range = current.high - current.low;
    const bodyRatio = range > 0 ? (current.close - current.open) / range : 0;

    return FeatureVector.create([
      relativeRange,
      logReturn1,
      logReturn5,
      localVolatility,
      normVolume,
      rsi14,
      emaRatioShort,
      emaRatioLong,
      macdNorm,
      bbPosition,
      logReturn10,
      logReturn20,
      volumeRatio,
      bodyRatio,
    ]);
  }

  /** Exponential Moving Average ending at `index`, using `period` candles. */
  private ema(candles: Candle[], period: number, index: number): number {
    const k = 2 / (period + 1);
    let value = candles[index - period + 1].close;
    for (let i = index - period + 2; i <= index; i++) {
      value = candles[i].close * k + value * (1 - k);
    }
    return value;
  }

  /** RSI (Wilder's smoothing) over `period` candles ending at `index`. Returns 0-100. */
  private rsi(candles: Candle[], period: number, index: number): number {
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = index - period + 1; i <= index - period + 1 + period - 1 && i <= index; i++) {
      const delta = candles[i].close - candles[i - 1].close;
      if (delta > 0) avgGain += delta;
      else avgLoss += Math.abs(delta);
    }
    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /** Bollinger Bands (SMA +/- 2*std) over `period` candles ending at `index`. */
  private bollingerBands(
    candles: Candle[],
    period: number,
    index: number,
  ): { upper: number; lower: number; middle: number } {
    const slice = candles.slice(index - period + 1, index + 1).map((c) => c.close);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    return { upper: mean + 2 * std, lower: mean - 2 * std, middle: mean };
  }
}
