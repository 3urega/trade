import { Injectable, BadRequestException } from '@nestjs/common';
import { RunBacktestUseCase } from './run-backtest.use-case.js';
import { RunBacktestDto } from '../dtos/run-backtest.dto.js';
import { Timeframe, ModelType, PredictionMode } from '../../domain/enums.js';

export interface RollingBacktestDto {
  symbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  modelType: ModelType;
  warmupPeriod?: number;
  windowDays: number;
  stepDays: number;
  predictionMode?: PredictionMode;
  signalThreshold?: number;
}

export interface RollingWindowResult {
  from: string;
  to: string;
  sessionId: string;
  sharpeRatio: number;
  skillScore: number;
  directionalAccuracy: number;
  predictionCorrelation: number | null;
  conditionalReturnBuy: number | null;
}

export interface RollingBacktestAggregate {
  sharpeMean: number;
  sharpeStdDev: number;
  stabilityScore: number;
  skillScoreMean: number;
  correlationMean: number;
  pctPositiveSharpe: number;
}

export interface RollingBacktestResult {
  windows: RollingWindowResult[];
  aggregate: RollingBacktestAggregate;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class RunRollingBacktestUseCase {
  constructor(private readonly runBacktestUseCase: RunBacktestUseCase) {}

  async execute(dto: RollingBacktestDto): Promise<RollingBacktestResult> {
    const fromMs = new Date(dto.from).getTime();
    const toMs = new Date(dto.to).getTime();
    const windowMs = dto.windowDays * MS_PER_DAY;
    const stepMs = dto.stepDays * MS_PER_DAY;

    if (windowMs <= 0 || stepMs <= 0) {
      throw new BadRequestException('windowDays and stepDays must be positive');
    }
    if (toMs - fromMs < windowMs) {
      throw new BadRequestException('Total range is smaller than one window. Increase range or decrease windowDays.');
    }
    if (dto.windowDays > 365 * 3) {
      throw new BadRequestException('windowDays cannot exceed 3 years (1095 days).');
    }

    // Build list of windows
    const windowStarts: number[] = [];
    for (let start = fromMs; start + windowMs <= toMs; start += stepMs) {
      windowStarts.push(start);
    }

    if (windowStarts.length === 0) {
      throw new BadRequestException('No windows fit in the given range.');
    }
    if (windowStarts.length > 20) {
      throw new BadRequestException(
        `Too many windows (${windowStarts.length}). Increase stepDays or reduce the total range.`,
      );
    }

    const windows: RollingWindowResult[] = [];

    for (const start of windowStarts) {
      const windowFrom = new Date(start).toISOString();
      const windowTo = new Date(start + windowMs).toISOString();

      const backtestDto: RunBacktestDto = {
        symbol: dto.symbol,
        timeframe: dto.timeframe,
        from: windowFrom,
        to: windowTo,
        modelType: dto.modelType,
        warmupPeriod: dto.warmupPeriod ?? 20,
        predictionMode: dto.predictionMode,
        signalThreshold: dto.signalThreshold,
      };

      const session = await this.runBacktestUseCase.execute(backtestDto);

      windows.push({
        from: windowFrom,
        to: windowTo,
        sessionId: session.id,
        sharpeRatio: session.metrics?.sharpeRatio ?? 0,
        skillScore: session.metrics?.skillScore ?? 0,
        directionalAccuracy: session.metrics?.directionalAccuracy ?? 0,
        predictionCorrelation: session.predictionCorrelation ?? null,
        conditionalReturnBuy: session.signalQuality?.conditionalReturnBuy ?? null,
      });
    }

    const aggregate = computeAggregate(windows);

    return { windows, aggregate };
  }
}

function computeAggregate(windows: RollingWindowResult[]): RollingBacktestAggregate {
  if (windows.length === 0) {
    return { sharpeMean: 0, sharpeStdDev: 0, stabilityScore: 0, skillScoreMean: 0, correlationMean: 0, pctPositiveSharpe: 0 };
  }

  const sharpes = windows.map((w) => w.sharpeRatio);
  const skillScores = windows.map((w) => w.skillScore);
  const correlations = windows.filter((w) => w.predictionCorrelation !== null).map((w) => w.predictionCorrelation as number);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stdDev = (arr: number[]) => {
    const m = mean(arr);
    const variance = arr.reduce((a, v) => a + (v - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  const sharpeMean = mean(sharpes);
  const sharpeStdDev = stdDev(sharpes);
  const stabilityScore = sharpeStdDev === 0 ? (sharpeMean > 0 ? 999 : 0) : sharpeMean / sharpeStdDev;
  const skillScoreMean = mean(skillScores);
  const correlationMean = correlations.length > 0 ? mean(correlations) : 0;
  const pctPositiveSharpe = (sharpes.filter((s) => s > 0).length / sharpes.length) * 100;

  return { sharpeMean, sharpeStdDev, stabilityScore, skillScoreMean, correlationMean, pctPositiveSharpe };
}
