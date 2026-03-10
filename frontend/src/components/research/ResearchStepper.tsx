import type { BacktestSession, SignalQuality, ParameterSweepResult, RollingBacktestResult } from '../../types/index.ts';

interface Props {
  session: BacktestSession;
  /** Whether the user has run a permutation test (tracked in parent state) */
  permutationDone?: boolean;
  /** Result from parameter sweep (Paso 4) */
  sweepResult?: ParameterSweepResult | null;
  /** Result from rolling backtest (Paso 5) */
  rollingResult?: RollingBacktestResult | null;
}

type StepStatus = 'green' | 'yellow' | 'red' | 'pending' | 'locked';

interface Step {
  number: number;
  label: string;
  sublabel: string;
  status: StepStatus;
  tooltip: string;
  available: boolean;
}

function signalQualityStatus(sq: SignalQuality | undefined, r: number | undefined): StepStatus {
  if (!sq) return 'pending';
  const pOk = sq.pValue !== null && sq.pValue < 0.05;
  const corOk = r != null && Math.abs(r) > 0.05;
  const buyOk = sq.conditionalReturnBuy !== null && sq.conditionalReturnBuy > 0.0003;
  const okCount = [pOk, corOk, buyOk].filter(Boolean).length;
  if (okCount === 3) return 'green';
  if (okCount >= 1) return 'yellow';
  return 'red';
}

function forwardTestStatus(session: BacktestSession): StepStatus {
  if (!session.tradingMetrics) return 'pending';
  const { sharpeRatio, maxDrawdownPercent, totalPnlPercent } = session.tradingMetrics;
  if (totalPnlPercent > 0 && sharpeRatio > 0.5 && maxDrawdownPercent < 10) return 'green';
  if (totalPnlPercent > 0) return 'yellow';
  return 'red';
}

function stepColor(status: StepStatus): string {
  switch (status) {
    case 'green': return 'bg-green-500 border-green-500 text-white';
    case 'yellow': return 'bg-yellow-500 border-yellow-500 text-white';
    case 'red': return 'bg-red-500 border-red-500 text-white';
    case 'pending': return 'bg-gray-700 border-gray-600 text-gray-400';
    case 'locked': return 'bg-gray-800 border-gray-700 text-gray-600';
  }
}

function stepDotColor(status: StepStatus): string {
  switch (status) {
    case 'green': return 'text-green-400';
    case 'yellow': return 'text-yellow-400';
    case 'red': return 'text-red-400';
    case 'pending': return 'text-gray-500';
    case 'locked': return 'text-gray-700';
  }
}

function connectorColor(status: StepStatus): string {
  return status === 'green' || status === 'yellow'
    ? 'bg-gray-500'
    : 'bg-gray-700';
}

function statusIcon(status: StepStatus): string {
  switch (status) {
    case 'green': return '✓';
    case 'yellow': return '~';
    case 'red': return '✗';
    case 'pending': return '○';
    case 'locked': return '·';
  }
}

function sweepStatus(result: ParameterSweepResult | null | undefined): StepStatus {
  if (!result) return 'pending';
  if (result.robustnessScore >= 60) return 'green';
  if (result.robustnessScore >= 20) return 'yellow';
  return 'red';
}

function rollingStatus(result: RollingBacktestResult | null | undefined): StepStatus {
  if (!result) return 'pending';
  const score = result.aggregate.stabilityScore;
  if (score > 1) return 'green';
  if (score >= 0.5) return 'yellow';
  return 'red';
}

function buildSteps(
  session: BacktestSession,
  permutationDone: boolean,
  sweepResult: ParameterSweepResult | null | undefined,
  rollingResult: RollingBacktestResult | null | undefined,
): Step[] {
  const sq = session.signalQuality;
  const r = session.predictionCorrelation;
  const fi = session.featureImportance;

  return [
    {
      number: 1,
      label: 'Señal',
      sublabel: '¿Hay algo ahí?',
      status: signalQualityStatus(sq, r),
      tooltip: sq
        ? `Correlación: ${r?.toFixed(4) ?? '—'} · p-value: ${sq.pValue?.toFixed(4) ?? '—'}`
        : 'Ejecuta un backtest para ver el panel Signal Quality',
      available: true,
    },
    {
      number: 2,
      label: 'Azar',
      sublabel: '¿Es real o suerte?',
      status: permutationDone ? 'green' : 'pending',
      tooltip: permutationDone
        ? 'Permutation test ejecutado'
        : 'Pulsa "Validar contra azar" en el panel Permutation Test',
      available: session.status === 'COMPLETED',
    },
    {
      number: 3,
      label: 'Features',
      sublabel: '¿De dónde viene?',
      status: fi ? 'green' : 'pending',
      tooltip: fi
        ? `Feature importance calculado (${fi.modelType})`
        : 'Pulsa "Analizar features" para extraer la importancia del modelo',
      available: session.status === 'COMPLETED' && !!session.modelSnapshotId,
    },
    {
      number: 4,
      label: 'Robustez',
      sublabel: '¿Rango de params?',
      status: sweepResult ? sweepStatus(sweepResult) : (session.status === 'COMPLETED' ? 'pending' : 'locked'),
      tooltip: sweepResult
        ? `Robustez: ${sweepResult.robustnessScore.toFixed(0)}% de los umbrales son rentables`
        : 'Pulsa "Probar robustez" en el panel Paso 4',
      available: session.status === 'COMPLETED',
    },
    {
      number: 5,
      label: 'Temporal',
      sublabel: '¿2022, 2023, 2024?',
      status: rollingResult ? rollingStatus(rollingResult) : (session.status === 'COMPLETED' ? 'pending' : 'locked'),
      tooltip: rollingResult
        ? `Estabilidad temporal: score ${rollingResult.aggregate.stabilityScore.toFixed(2)}, ${rollingResult.windows.length} ventanas`
        : 'Pulsa "Probar consistencia temporal" en el panel Paso 5',
      available: session.status === 'COMPLETED',
    },
    {
      number: 6,
      label: 'Forward',
      sublabel: 'Con fees y stops',
      status: forwardTestStatus(session),
      tooltip: session.tradingMetrics
        ? `P&L: ${session.tradingMetrics.totalPnlPercent?.toFixed(2) ?? '—'}% · Sharpe: ${session.tradingMetrics.sharpeRatio?.toFixed(2) ?? '—'}`
        : 'Ejecuta un Forward Test out-of-sample',
      available: session.status === 'COMPLETED',
    },
    {
      number: 7,
      label: 'Decisión',
      sublabel: 'Activar / Descartar',
      status: (() => {
        const stepStatuses: StepStatus[] = [
          signalQualityStatus(sq, r),
          permutationDone ? 'green' : 'pending',
          fi ? 'green' : 'pending',
          sweepResult ? sweepStatus(sweepResult) : 'pending',
          rollingResult ? rollingStatus(rollingResult) : 'pending',
          forwardTestStatus(session),
        ];
        const reds = stepStatuses.filter((s) => s === 'red').length;
        const greens = stepStatuses.filter((s) => s === 'green').length;
        const hasPending = stepStatuses.some((s) => s === 'pending');
        if (hasPending) return 'pending' as StepStatus;
        if (reds > 0) return 'red' as StepStatus;
        if (greens >= 4) return 'green' as StepStatus;
        return 'yellow' as StepStatus;
      })(),
      tooltip: 'Resumen de todos los pasos completados',
      available: session.status === 'COMPLETED',
    },
  ];
}

function StepNode({ step }: { step: Step }) {
  return (
    <div className="flex flex-col items-center gap-1 relative group" title={step.tooltip}>
      <div
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${stepColor(step.status)} ${!step.available ? 'cursor-not-allowed opacity-50' : 'cursor-default'}`}
      >
        {statusIcon(step.status)}
      </div>
      <div className="text-center">
        <p className={`text-xs font-medium leading-tight ${stepDotColor(step.status)}`}>{step.label}</p>
        <p className="text-[10px] text-gray-600 leading-tight hidden sm:block">{step.sublabel}</p>
      </div>
      {/* Tooltip on hover */}
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 text-center">
        {step.tooltip}
        {!step.available && step.status === 'locked' && (
          <span className="block text-gray-600 mt-0.5">Próximamente</span>
        )}
      </div>
    </div>
  );
}

export function ResearchStepper({ session, permutationDone = false, sweepResult, rollingResult }: Props) {
  const steps = buildSteps(session, permutationDone, sweepResult, rollingResult);

  const completedSteps = steps.filter((s) => s.status === 'green' || s.status === 'yellow').length;
  const availableSteps = steps.filter((s) => s.available).length;

  return (
    <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Pipeline de Investigación
        </h3>
        <span className="text-xs text-gray-600">
          {completedSteps}/{availableSteps} pasos completados
        </span>
      </div>

      {/* Steps row */}
      <div className="flex items-start justify-between">
        {steps.map((step, i) => (
          <div key={step.number} className="flex items-center flex-1">
            <StepNode step={step} />
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mt-[-12px] mx-1 ${connectorColor(step.status)}`} />
            )}
          </div>
        ))}
      </div>

      {/* Quick verdict */}
      {(() => {
        const s7 = steps[6];
        if (s7.status === 'pending') return null;
        const msgs: Record<StepStatus, string | null> = {
          green: '✅ Señal validada en todos los pasos disponibles. Considera activar un preset.',
          yellow: '⚠️ Señal parcialmente validada. Revisa los pasos en amarillo antes de operar.',
          red: '❌ La señal no pasa los filtros. Ajusta el modelo o cambia configuración.',
          pending: null,
          locked: null,
        };
        const msg = msgs[s7.status];
        if (!msg) return null;
        const colors: Record<string, string> = {
          green: 'border-green-500/20 bg-green-900/10 text-green-300',
          yellow: 'border-yellow-500/20 bg-yellow-900/10 text-yellow-300',
          red: 'border-red-500/20 bg-red-900/10 text-red-300',
        };
        return (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${colors[s7.status] ?? ''}`}>
            {msg}
          </div>
        );
      })()}
    </div>
  );
}
