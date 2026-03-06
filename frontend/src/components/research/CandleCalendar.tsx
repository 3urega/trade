import { useState, useEffect } from 'react';
import { fetchCandleSummary } from '../../services/api.ts';
import type { CandleDatasetSummary } from '../../types/index.ts';

interface Props {
  refreshTrigger?: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Returns 'YYYY-MM-DD' for a local date (avoids UTC shift problems). */
function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Builds a Set of 'YYYY-MM-DD' keys for every day in each dataset's [start, end] range. */
function buildCoveredSet(datasets: CandleDatasetSummary[]): Set<string> {
  const covered = new Set<string>();
  for (const ds of datasets) {
    const start = new Date(ds.start);
    const end = new Date(ds.end);
    // Normalise to midnight local time so day comparison is stable
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
      covered.add(toDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return covered;
}

/** Returns {year, month} of the most recent end date across datasets, or today. */
function latestMonth(datasets: CandleDatasetSummary[]): { year: number; month: number } {
  if (datasets.length === 0) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  const latest = datasets.reduce((best, ds) =>
    new Date(ds.end) > new Date(best.end) ? ds : best,
  );
  const d = new Date(latest.end);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function CandleCalendar({ refreshTrigger }: Props) {
  const [datasets, setDatasets] = useState<CandleDatasetSummary[]>([]);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  useEffect(() => {
    fetchCandleSummary()
      .then((data) => {
        setDatasets(data);
        const { year, month } = latestMonth(data);
        setViewYear(year);
        setViewMonth(month);
      })
      .catch(() => {});
  }, [refreshTrigger]);

  const covered = buildCoveredSet(datasets);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  // Day grid: Monday-first. getDay() returns 0=Sun…6=Sat; convert to 0=Mon…6=Sun
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const leadingEmpties = (firstDow + 6) % 7; // shift so Monday=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const totalDatasets = datasets.length;
  const totalDays = covered.size;

  return (
    <div className="bg-gray-900 rounded-lg px-3 pt-3 pb-2 border border-gray-800">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={prevMonth}
          className="text-gray-500 hover:text-gray-200 transition-colors w-5 h-5 flex items-center justify-center text-sm leading-none"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="text-[11px] font-semibold text-gray-300 tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="text-gray-500 hover:text-gray-200 transition-colors w-5 h-5 flex items-center justify-center text-sm leading-none"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px mb-px">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[9px] font-medium text-gray-600 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: leadingEmpties }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = toDateKey(viewYear, viewMonth, day);
          const hasCoverage = covered.has(key);
          const isToday = key === todayKey;
          return (
            <div
              key={day}
              title={hasCoverage ? 'Datos cargados' : undefined}
              className={[
                'text-center text-[10px] leading-none py-[3px] rounded-sm select-none',
                hasCoverage
                  ? 'bg-emerald-600/75 text-emerald-100 font-semibold'
                  : 'text-gray-700',
                isToday && !hasCoverage ? 'ring-1 ring-inset ring-gray-600' : '',
                isToday && hasCoverage ? 'ring-1 ring-inset ring-emerald-300' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="mt-1.5 flex items-center gap-2 text-[9px] text-gray-600">
        <span className="inline-block w-2 h-2 rounded-sm bg-emerald-600/75 shrink-0" />
        <span>
          {totalDays > 0
            ? `${totalDays.toLocaleString('es-ES')} días · ${totalDatasets} dataset${totalDatasets !== 1 ? 's' : ''}`
            : 'Sin datos cargados'}
        </span>
      </div>
    </div>
  );
}
