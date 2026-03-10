import { useState } from 'react';
import type { ParameterSweepResult } from '../../types/index.ts';
import { runParameterSweep } from '../../services/api.ts';

interface Props {
  sessionId: string;
  onCompleted?: (result: ParameterSweepResult) => void;
}

type TrafficLight = 'green' | 'yellow' | 'red' | 'gray';

function trafficDot(color: TrafficLight) {
  const map: Record<TrafficLight, string> = {
    green: 'inline-block w-3 h-3 rounded-full bg-green-400 flex-shrink-0',
    yellow: 'inline-block w-3 h-3 rounded-full bg-yellow-400 flex-shrink-0',
    red: 'inline-block w-3 h-3 rounded-full bg-red-400 flex-shrink-0',
    gray: 'inline-block w-3 h-3 rounded-full bg-gray-500 flex-shrink-0',
  };
  return <span className={map[color]} />;
}

function robustnessLight(score: number): TrafficLight {
  if (score >= 60) return 'green';
  if (score >= 20) return 'yellow';
  return 'red';
}

function fmt(v: number | null, decimals = 4): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(decimals);
}

/** Simple SVG line chart for the sweep */
function SweepLineChart({ values, yData, yLabel }: {
  values: number[];
  yData: (number | null)[];
  yLabel: string;
}) {
  if (values.length < 2) return null;

  const valid = yData.filter((v): v is number => v !== null);
  const yMin = Math.min(...valid, 0);
  const yMax = Math.max(...valid, 0.0001);
  const yRange = yMax - yMin || 0.0001;
  const W = 480;
  const H = 120;
  const PAD = { top: 10, right: 10, bottom: 30, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const toX = (i: number) => PAD.left + (i / (values.length - 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - yMin) / yRange) * chartH;

  const points = yData
    .map((v, i) => (v !== null ? `${toX(i)},${toY(v)}` : null))
    .filter(Boolean)
    .join(' ');

  const zeroY = toY(0);

  // x-axis labels: first, middle, last
  const labelIdxs = [0, Math.floor(values.length / 2), values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 mt-2" style={{ maxWidth: W }}>
      {/* Zero line */}
      <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="#4b5563" strokeDasharray="4 2" strokeWidth={1} />
      {/* Y-axis */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="#6b7280" strokeWidth={1} />
      {/* X-axis */}
      <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="#6b7280" strokeWidth={1} />

      {/* Y-axis labels */}
      <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{fmt(yMax, 5)}</text>
      <text x={PAD.left - 4} y={zeroY + 3} textAnchor="end" fontSize={9} fill="#9ca3af">0</text>
      <text x={PAD.left - 4} y={PAD.top + chartH} textAnchor="end" fontSize={9} fill="#9ca3af">{fmt(yMin, 5)}</text>

      {/* Y-axis label */}
      <text
        x={10} y={PAD.top + chartH / 2}
        textAnchor="middle" fontSize={9} fill="#9ca3af"
        transform={`rotate(-90,10,${PAD.top + chartH / 2})`}
      >{yLabel}</text>

      {/* X-axis labels */}
      {labelIdxs.map((idx) => (
        <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fontSize={9} fill="#9ca3af">
          {values[idx].toFixed(5)}
        </text>
      ))}

      {/* Line */}
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" />

      {/* Dots */}
      {yData.map((v, i) =>
        v !== null ? (
          <circle key={i} cx={toX(i)} cy={toY(v)} r={3}
            fill={v > 0 ? '#22c55e' : '#ef4444'}
            stroke="#1f2937" strokeWidth={1} />
        ) : null,
      )}
    </svg>
  );
}

export default function ParameterSweepPanel({ sessionId, onCompleted }: Props) {
  const [min, setMin] = useState(0.0001);
  const [max, setMax] = useState(0.002);
  const [steps, setSteps] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParameterSweepResult | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await runParameterSweep(sessionId, { parameter: 'signalThreshold', min, max, steps });
      setResult(r);
      onCompleted?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const light = result ? robustnessLight(result.robustnessScore) : 'gray';

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center gap-2">
          {result && trafficDot(light)}
          Paso 4 — Robustez a parámetros
        </h3>
        {result && (
          <span className="text-xs text-gray-400">
            Score: <span className={`font-bold ${light === 'green' ? 'text-green-400' : light === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
              {result.robustnessScore.toFixed(0)}%
            </span> de valores rentables
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400">
        Prueba si la estrategia es robusta a cambios en el umbral de señal (<code className="text-gray-300">signalThreshold</code>).
        Un modelo robusto debería ser rentable en un amplio rango de valores, no solo en un punto exacto.
      </p>

      {/* Config form */}
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Mínimo
          <input
            type="number" step="0.00005" min="0.00001" max={max - 0.00001}
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Máximo
          <input
            type="number" step="0.0001" min={min + 0.00001} max="0.05"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Pasos
          <input
            type="number" step="1" min="3" max="20"
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
      </div>

      <button
        onClick={handleRun}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
      >
        {loading ? 'Analizando…' : 'Probar robustez'}
      </button>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {result && (
        <div className="space-y-4 mt-2">
          {/* Robustness badge */}
          <div className={`rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 ${
            light === 'green' ? 'bg-green-900/50 text-green-300' :
            light === 'yellow' ? 'bg-yellow-900/50 text-yellow-300' :
            'bg-red-900/50 text-red-300'
          }`}>
            {trafficDot(light)}
            {light === 'green' && `Robusto: ${result.robustnessScore.toFixed(0)}% de los umbrales generan retorno positivo. La estrategia no depende de un valor exacto.`}
            {light === 'yellow' && `Moderado: ${result.robustnessScore.toFixed(0)}% de los umbrales son rentables. Funciona en algunos rangos pero es sensible al parámetro.`}
            {light === 'red' && `Frágil: solo ${result.robustnessScore.toFixed(0)}% de los umbrales son rentables. La estrategia depende críticamente del valor exacto del umbral.`}
          </div>

          {/* Line chart */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Retorno condicional BUY por umbral de señal</p>
            <SweepLineChart
              values={result.values}
              yData={result.metrics.map((m) => m.conditionalReturnBuy)}
              yLabel="Ret. BUY"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-300">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1 pr-3">Umbral</th>
                  <th className="text-right pr-3">Ret. BUY</th>
                  <th className="text-right pr-3">Ret. SELL</th>
                  <th className="text-right pr-3"># BUY</th>
                  <th className="text-right pr-3"># SELL</th>
                  <th className="text-right">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {result.metrics.map((m, i) => {
                  const isGood = m.conditionalReturnBuy !== null && m.conditionalReturnBuy > 0;
                  return (
                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-1 pr-3 font-mono">{m.value.toFixed(5)}</td>
                      <td className={`text-right pr-3 font-mono ${isGood ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt(m.conditionalReturnBuy, 5)}
                      </td>
                      <td className="text-right pr-3 font-mono">{fmt(m.conditionalReturnSell, 5)}</td>
                      <td className="text-right pr-3">{m.countBuy}</td>
                      <td className="text-right pr-3">{m.countSell}</td>
                      <td className={`text-right font-mono ${m.sharpeRatio > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {m.sharpeRatio.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
