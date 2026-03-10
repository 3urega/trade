import type { SignalQuality } from '../../types/index.ts';

interface Props {
  signalQuality: SignalQuality;
  predictionCorrelation?: number;
}

type TrafficLight = 'green' | 'yellow' | 'red' | 'gray';

function trafficLight(color: TrafficLight) {
  const base = 'inline-block w-3 h-3 rounded-full flex-shrink-0';
  const map: Record<TrafficLight, string> = {
    green: `${base} bg-green-400`,
    yellow: `${base} bg-yellow-400`,
    red: `${base} bg-red-400`,
    gray: `${base} bg-gray-500`,
  };
  return <span className={map[color]} />;
}

function pValueLight(pValue: number | null): TrafficLight {
  if (pValue === null) return 'gray';
  if (pValue < 0.05) return 'green';
  if (pValue < 0.15) return 'yellow';
  return 'red';
}

function conditionalLight(ret: number | null): TrafficLight {
  if (ret === null) return 'gray';
  if (ret > 0.0003) return 'green';
  if (ret > 0) return 'yellow';
  return 'red';
}

function correlationLight(r: number | undefined): TrafficLight {
  if (r == null) return 'gray';
  if (Math.abs(r) > 0.1) return 'green';
  if (Math.abs(r) > 0.03) return 'yellow';
  return 'red';
}

function fmt(v: number | null, decimals = 4): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(decimals);
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(3)}%`;
}

function Verdict({ sq, r }: { sq: SignalQuality; r?: number }) {
  const signals: { ok: boolean; msg: string }[] = [];

  const pOk = sq.pValue !== null && sq.pValue < 0.05;
  const pMarg = sq.pValue !== null && sq.pValue < 0.15;
  signals.push({
    ok: pOk,
    msg: pOk
      ? `Correlación estadísticamente significativa (p=${fmt(sq.pValue, 3)})`
      : pMarg
        ? `Correlación marginalmente significativa (p=${fmt(sq.pValue, 3)}, zona gris)`
        : `Correlación NO significativa (p=${fmt(sq.pValue, 3)} ≥ 0.05)`,
  });

  const buyOk = sq.conditionalReturnBuy !== null && sq.conditionalReturnBuy > 0.0003;
  signals.push({
    ok: buyOk,
    msg: buyOk
      ? `Señal BUY tiene retorno condicional positivo (${fmtPct(sq.conditionalReturnBuy)})`
      : `Señal BUY sin edge claro (retorno condicional: ${fmtPct(sq.conditionalReturnBuy)})`,
  });

  const corrOk = r != null && Math.abs(r) > 0.05;
  signals.push({
    ok: corrOk,
    msg: corrOk
      ? `Correlación predicción-real notable (${fmt(r, 4)})`
      : `Correlación predicción-real débil (${fmt(r, 4)})`,
  });

  const okCount = signals.filter((s) => s.ok).length;
  const overallColor =
    okCount === 3 ? 'border-green-500/30 bg-green-900/10'
    : okCount === 2 ? 'border-yellow-500/30 bg-yellow-900/10'
    : 'border-red-500/30 bg-red-900/10';

  const overallLabel =
    okCount === 3 ? '✅ Señal con edge potencial — continúa la investigación'
    : okCount >= 1 ? '⚠️ Señal débil o mixta — resultados poco concluyentes'
    : '❌ Sin edge detectable — revisa features o período';

  return (
    <div className={`rounded-lg border p-3 mt-3 ${overallColor}`}>
      <p className="text-sm font-semibold text-gray-200 mb-2">{overallLabel}</p>
      <ul className="space-y-1">
        {signals.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
            {trafficLight(s.ok ? 'green' : 'red')}
            <span>{s.msg}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mini bar chart for calibration data using pure CSS */
function CalibrationChart({ calibration }: { calibration: SignalQuality['calibration'] }) {
  if (!calibration || calibration.length === 0) return null;

  const maxAbs = Math.max(...calibration.flatMap((b) => [Math.abs(b.avgPredicted), Math.abs(b.avgActual)]));
  const scale = maxAbs > 0 ? 60 / maxAbs : 1; // max bar 60px

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        Calibración — predicción vs retorno real medio por decil
      </p>
      <div className="flex items-end gap-0.5 h-20 border-b border-gray-700">
        {calibration.map((b, i) => {
          const predH = Math.abs(b.avgPredicted) * scale;
          const actH = Math.abs(b.avgActual) * scale;
          const predPos = b.avgPredicted >= 0;
          const actPos = b.avgActual >= 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={
              `Bucket ${i + 1}\nPredicción media: ${fmtPct(b.avgPredicted)}\nRetorno real medio: ${fmtPct(b.avgActual)}\nn=${b.count}`
            }>
              <div
                className={`w-full rounded-t ${predPos ? 'bg-violet-500/70' : 'bg-violet-300/40'}`}
                style={{ height: `${predH}px`, minHeight: 2 }}
              />
              <div
                className={`w-full rounded-t ${actPos ? 'bg-cyan-400/70' : 'bg-red-400/50'}`}
                style={{ height: `${actH}px`, minHeight: 2 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-1">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="inline-block w-3 h-2 bg-violet-500/70 rounded" /> Predicción
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="inline-block w-3 h-2 bg-cyan-400/70 rounded" /> Real
        </span>
      </div>
    </div>
  );
}

export function SignalQualityPanel({ signalQuality: sq, predictionCorrelation: r }: Props) {
  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
        PASO 1 — Calidad de la Señal
      </h3>

      {/* Significance */}
      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Significancia estadística</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Correlación</p>
            <div className="flex items-center gap-2">
              {trafficLight(correlationLight(r))}
              <span className="text-sm font-bold text-white tabular-nums">{fmt(r)}</span>
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">t-estadístico</p>
            <span className="text-sm font-bold text-white tabular-nums">{fmt(sq.tStat, 3)}</span>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">p-value</p>
            <div className="flex items-center gap-2">
              {trafficLight(pValueLight(sq.pValue))}
              <span className="text-sm font-bold text-white tabular-nums">{fmt(sq.pValue, 4)}</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">{sq.pValue !== null && sq.pValue < 0.05 ? 'sig. al 95%' : sq.pValue !== null && sq.pValue < 0.1 ? 'sig. al 90%' : 'no sig.'}</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Predicciones</p>
            <span className="text-sm font-bold text-white tabular-nums">
              {sq.countBuy + sq.countSell} / señal
            </span>
            <p className="text-xs text-gray-600 mt-0.5">{sq.countBuy} buy · {sq.countSell} sell</p>
          </div>
        </div>
      </div>

      {/* Conditional returns */}
      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Edge económico de la señal</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Retorno real medio cuando BUY</p>
            <div className="flex items-center gap-2">
              {trafficLight(conditionalLight(sq.conditionalReturnBuy))}
              <span className="text-sm font-bold text-white tabular-nums">{fmtPct(sq.conditionalReturnBuy)}</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">n={sq.countBuy}</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Retorno real medio cuando SELL</p>
            <div className="flex items-center gap-2">
              {trafficLight(conditionalLight(sq.conditionalReturnSell !== null ? -sq.conditionalReturnSell : null))}
              <span className="text-sm font-bold text-white tabular-nums">{fmtPct(sq.conditionalReturnSell)}</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">n={sq.countSell} (bueno si negativo)</p>
          </div>
        </div>
      </div>

      {/* Calibration chart */}
      {sq.calibration && sq.calibration.length > 0 && (
        <CalibrationChart calibration={sq.calibration} />
      )}

      {/* Verdict */}
      <Verdict sq={sq} r={r} />
    </div>
  );
}
