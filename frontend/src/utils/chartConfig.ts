import { ColorType } from 'lightweight-charts';
import type { TimeScaleOptions } from 'lightweight-charts';

export const chartLocalization = {
  locale: 'es-ES',
} as const;

export const chartLayoutOptions = {
  background: { type: ColorType.Solid, color: '#030712' },
  textColor: '#9ca3af',
};

export const chartGridOptions = {
  vertLines: { color: '#1f2937' },
  horzLines: { color: '#1f2937' },
};

export const chartRightPriceScaleOptions = {
  borderColor: '#374151',
};

/** Base time scale options with dd/MM/yyyy (and hour when intraday) */
function createTickMarkFormatter(isIntraday: boolean) {
  const dateFormat: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };
  const dateTimeFormat: Intl.DateTimeFormatOptions = {
    ...dateFormat,
    hour: '2-digit',
    minute: '2-digit',
  };

  return (time: unknown): string => {
    if (typeof time === 'object' && time !== null && 'year' in time) {
      const t = time as { year: number; month: number; day: number };
      const date = new Date(Date.UTC(t.year, t.month - 1, t.day));
      return new Intl.DateTimeFormat('es-ES', dateFormat).format(date);
    }
    const ts =
      typeof time === 'string' ? new Date(time).getTime() / 1000 : (time as number);
    const date = new Date(ts * 1000);
    return new Intl.DateTimeFormat('es-ES', isIntraday ? dateTimeFormat : dateFormat).format(date);
  };
}

/**
 * Time scale options with clear día/mes/año.
 * @param timeframe - When '1d' shows only date; otherwise date + time
 */
export function getChartTimeScaleOptions(timeframe?: string): Partial<TimeScaleOptions> {
  const isIntraday = timeframe !== '1d';
  return {
    timeVisible: true,
    secondsVisible: false,
    borderColor: '#374151',
    tickMarkFormatter: createTickMarkFormatter(isIntraday),
  };
}

/** Default time scale options (intraday format: date + time) */
export const chartTimeScaleOptions = getChartTimeScaleOptions('5m');
