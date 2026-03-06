# Plan Total — Bot Tipo 2: paso a paso

> Fuentes: `feedback.md`, `mas_feedback.md`, `diagnostico_final.md`, `plan_para_ser_rico.md`.
> Principio: cada paso es atómico, testeable y no rompe lo anterior.

---

## Estado actual del código (referencia)

| Archivo | Estado |
|---------|--------|
| `ml-engine/app.py` | 3 regresores (SGD, PA, MLP). Endpoints: `/initialize`, `/partial-train`, `/predict`, `/save-model`, `/load-model`. Un modelo en memoria por sesión. |
| `run-backtest.use-case.ts` | Loop walk-forward: predict → train → registrar error. Target: `logReturnTarget`. No simula trades. |
| `run-forward-test.use-case.ts` | Carga snapshot → predict por vela → `TradingSimulation`. Constantes: `SIGNAL_THRESHOLD=0.0005`, `FEE_RATE=0.001`, `POSITION_SIZE_PCT=0.5`. |
| `TradingSimulation` | `processTick(predictedLogReturn, price, time)`. BUY si `pred > threshold`, SELL si `pred < -threshold`. Sin stop loss, sin take profit, sin position sizing dinámico. |
| `RunForwardTestDto` | Solo: `backtestSessionId`, `from`, `to`, `initialCapital`, `allowInSample`. |
| `TradingMetrics` | `totalPnl`, `winRate`, `maxDrawdown`, `sharpeRatio`, `trades`, `equityCurve`. Falta `profitFactor`, `avgTrade`. |

---

## Pipeline objetivo (Bot Tipo 2)

```
candles → features → ensemble (3 modelos) → señal promedio
   → filtro confianza (solo operar si confidence > threshold)
   → position sizing dinámico (size = base × confidence)
   → stop loss / take profit dinámicos (basados en volatilidad)
   → trade decision → métricas
```

---

## PASO 1 — Parámetros configurables en forward test

**Problema**: `SIGNAL_THRESHOLD`, `FEE_RATE`, `POSITION_SIZE_PCT` son constantes hardcodeadas en `run-forward-test.use-case.ts` (líneas 23-25). No se pueden cambiar desde la UI.

### 1a. Ampliar `RunForwardTestDto`

**Archivo**: `backend/src/modules/research/application/dtos/run-forward-test.dto.ts`

Añadir campos opcionales con defaults razonables:

```ts
signalThreshold?: number;    // default 0.0005
feeRate?: number;            // default 0.001
positionSizePct?: number;    // default 0.5
```

### 1b. Usar parámetros del DTO en el use case

**Archivo**: `backend/src/modules/research/application/use-cases/run-forward-test.use-case.ts`

Reemplazar las constantes `SIGNAL_THRESHOLD`, `FEE_RATE`, `POSITION_SIZE_PCT` (líneas 23-25) por valores del DTO:

```ts
const signalThreshold = dto.signalThreshold ?? 0.0005;
const feeRate = dto.feeRate ?? 0.001;
const positionSizePct = dto.positionSizePct ?? 0.5;
```

Y pasarlos a `TradingSimulation.create(initialCapital, feeRate, signalThreshold, positionSizePct)` (línea 102).

### 1c. Formulario frontend

**Archivo**: `frontend/src/components/research/ForwardTestForm.tsx` (o equivalente)

Añadir 3 inputs numéricos: Signal Threshold, Fee Rate, Position Size %.

### Verificación

- Ejecutar un forward test con threshold 0.001 → debería hacer menos trades que con 0.0005.
- Los valores por defecto deben producir el mismo resultado que antes.

---

## PASO 2 — Métricas adicionales: profitFactor y avgTrade

**Problema**: `TradingMetrics` no incluye `profitFactor` ni `avgTrade`, que son métricas estándar de trading.

### 2a. Ampliar interfaz `TradingMetrics`

**Archivo**: `backend/src/modules/research/domain/value-objects/forward-test-result.ts`

Añadir a la interfaz `TradingMetrics` (línea 29):

```ts
profitFactor: number;
avgTrade: number;
```

### 2b. Calcular en `getMetrics()`

**Archivo**: mismo, en `TradingSimulation.getMetrics()` (después de línea 146)

```ts
const grossProfit = sellTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
const grossLoss = Math.abs(sellTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
const avgTrade = sellTrades.length > 0 ? totalPnl / sellTrades.length : 0;
```

### Verificación

- Ejecutar forward test → los nuevos campos deben aparecer en la respuesta JSON.
- `profitFactor > 1` = el sistema gana más de lo que pierde.

---

## PASO 3 — Stop loss y take profit dinámicos

**Problema**: el bot solo cierra posición cuando la señal cambia. Si el mercado se desploma, no hay protección.

### 3a. Ampliar `TradingSimulationState`

**Archivo**: `forward-test-result.ts`, interfaz `TradingSimulationState` (línea 15)

Añadir:

```ts
slMultiplier: number;
tpMultiplier: number;
stopLossPrice: number;
takeProfitPrice: number;
lastVolatility: number;
```

### 3b. Ampliar `TradingSimulation.create()`

**Archivo**: mismo, método `create()` (línea 56)

Añadir parámetros `slMultiplier = 2` y `tpMultiplier = 3`. Inicializar `stopLossPrice = 0`, `takeProfitPrice = 0`, `lastVolatility = 0`.

### 3c. Nuevo método `setVolatility(vol: number)`

**Archivo**: mismo

El forward test ya calcula features que incluyen `local_volatility` (posición 3 del feature vector). Antes de cada `processTick`, el use case llama a `simulation.setVolatility(featureVec[3])` para que la simulación conozca la volatilidad actual.

### 3d. Modificar `processTick()` para SL/TP

**Archivo**: mismo, `processTick()` (línea 77)

**Antes** de evaluar la señal de compra/venta, si hay posición abierta:

```ts
if (s.positionQty > 0) {
  if (currentPrice <= s.stopLossPrice) {
    // cerrar por stop loss
  } else if (currentPrice >= s.takeProfitPrice) {
    // cerrar por take profit
  }
}
```

**Al abrir** posición (BUY): calcular `stopLossPrice = entry - (slMultiplier × lastVolatility × entry)` y `takeProfitPrice = entry + (tpMultiplier × lastVolatility × entry)`.

### 3e. DTO y frontend

Añadir `slMultiplier` y `tpMultiplier` opcionales al DTO y formulario.

### Verificación

- Forward test con `slMultiplier=2, tpMultiplier=3` → las trades deben incluir cierres por SL/TP.
- `maxDrawdown` debería ser menor que sin stops.
- Trades cerrados por SL/TP deben identificarse (añadir campo `reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT'` a `SimTrade`).

---

## PASO 4 — Position sizing dinámico

**Problema**: el bot siempre invierte el 50% del capital, sin importar la confianza de la señal.

### 4a. Calcular confianza

**Archivo**: `forward-test-result.ts`, `processTick()`

Con el modelo actual (log_return): `confidence = Math.min(Math.abs(predictedLogReturn) / signalThreshold, 1)`.

Cuando la señal es débil (predicción apenas sobre threshold), `confidence ≈ 0` → position size pequeño.
Cuando la señal es fuerte (predicción muy por encima de threshold), `confidence ≈ 1` → position size máximo.

### 4b. Aplicar a position size

```ts
const dynamicSize = s.positionSizePct * confidence;
const investAmount = s.cash * dynamicSize;
```

Reemplaza: `const investAmount = s.cash * s.positionSizePct;` (línea 81).

### Verificación

- Forward test → la distribución de tamaños de trade debe variar.
- Trades con predicciones fuertes: tamaño grande. Trades con predicciones débiles: tamaño pequeño.
- `maxDrawdown` debería reducirse frente al sizing fijo.

---

## PASO 5 — Correlación predicción vs real en backtest

**Problema**: no sabemos si el modelo tiene señal real. Necesitamos `corr(predicted, actual)`.

### 5a. Acumular pares (predicted, actual) en el backtest

**Archivo**: `run-backtest.use-case.ts`

Dentro del loop, al hacer predict: guardar `predictedLogReturn` y `logReturnTarget` en dos arrays.

### 5b. Calcular correlación de Pearson al final

Tras el loop, calcular la correlación entre los dos arrays. Fórmula estándar o usar una utilidad.

### 5c. Guardar en BacktestSession

Añadir `predictionCorrelation` a `BacktestMetrics` (o a la respuesta del backtest).

### 5d. Mostrar en frontend

En los resultados del backtest, mostrar: "Correlación pred/real: 0.03" con indicador de color (verde si > 0.05, rojo si < 0).

### Verificación

- Ejecutar backtest → nueva métrica `predictionCorrelation` visible.
- El valor debe ser un número entre -1 y 1.

---

## PASO 6 — Ensemble de modelos

**Problema**: un solo modelo genera ruido y overfitting. Usar 3 modelos reduce ambos.

### 6a. ML Engine: estado para múltiples modelos

**Archivo**: `ml-engine/app.py`

Cambiar de un solo `model` global a un dict `models: dict[str, Any]`:

```python
models = {}       # {"sgd_regressor": model, "passive_aggressive": model, "mlp_regressor": model}
scalers_x = {}
scalers_y = {}
```

### 6b. Endpoint `POST /initialize-ensemble`

**Archivo**: `ml-engine/app.py`

Inicializa los 3 modelos de golpe. Crea un scaler_x y scaler_y compartidos (las features son las mismas).

### 6c. Endpoint `POST /partial-train-ensemble`

Entrena los 3 modelos con el mismo sample. Un solo scaler_x/scaler_y.

### 6d. Endpoint `POST /predict-ensemble`

Predice con los 3 modelos y devuelve la media:

```python
predictions = [m.predict(X_scaled) for m in models.values()]
avg_prediction = np.mean(predictions)
```

Response: `{ "prediction": avg_prediction, "individual": [...] }`

### 6e. Endpoint `POST /save-model-ensemble`

Guarda los 3 modelos + scalers en un solo snapshot.

### 6f. Backend: MlServicePort

Añadir métodos `initializeEnsemble()`, `partialTrainEnsemble()`, `predictEnsemble()`, `saveEnsemble()`, `loadEnsemble()` al port e implementar en el adapter HTTP.

### 6g. Backtest con ensemble

**Archivo**: `run-backtest.use-case.ts`

Si el usuario elige ensemble: llamar a `/initialize-ensemble`, `/partial-train-ensemble`, `/predict-ensemble` en lugar de los endpoints individuales.

### 6h. Forward test con ensemble

**Archivo**: `run-forward-test.use-case.ts`

Cargar ensemble → `/predict-ensemble` en cada tick.

### Verificación

- Backtest con ensemble → el log debe mostrar que se usan 3 modelos.
- La predicción ensemble debe ser más suave (menos varianza) que un modelo individual.
- Comparar skill score y correlación: ensemble vs modelo individual.

---

## PASO 7 — Modelo de volatilidad (clasificador)

**Problema**: predecir precio es muy difícil; predecir "¿habrá movimiento grande?" es más viable.

### 7a. SGDClassifier en ML Engine

**Archivo**: `ml-engine/app.py`

Añadir `SGDClassifier(loss="log_loss")` a `SUPPORTED_MODELS`. Nuevo endpoint `POST /predict-proba` que devuelve `{ probability: float }`.

### 7b. PredictionMode enum

**Archivo**: `backend/src/modules/research/domain/enums.ts`

```ts
export enum PredictionMode {
  RETURN = 'RETURN',
  VOLATILITY = 'VOLATILITY',
}
```

### 7c. Target volatilidad en backtest

Si `predictionMode === VOLATILITY`:
- `move = abs(close[i+1] - close[i]) / close[i]`
- `target = move > volatilityThreshold ? 1 : 0`
- Llamar `/train-classifier` y `/predict-proba`

### 7d. Trading por probabilidad en forward test

Si modo volatilidad: `if prob_move > confidenceThreshold → trade`. Dirección: `sign(logReturn1)` del feature vector.

### Verificación

- Backtest con modo VOLATILITY → genera trades basados en probabilidad de movimiento.
- Comparar métricas con modo RETURN.

---

## PASO 8 — Modelo de dirección + régimen (futuro)

Depende de que el Paso 7 demuestre que el clasificador aporta valor. Si la volatilidad funciona:

- **Dirección**: target `sign(close[i+1]-close[i])` → 1/0. Segundo clasificador.
- **Régimen**: target `abs(EMA20-EMA50)/close > threshold` → 1/0. Tercer clasificador.
- **Decisión**: `if prob_move > 0.65 && prob_trend > 0.5 → if prob_up > 0.55 BUY else SELL`.

---

## Parámetros configurables finales

| Parámetro | Descripción | Default | Paso |
|-----------|-------------|---------|------|
| `signalThreshold` | Umbral mínimo para operar | 0.0005 | 1 |
| `feeRate` | Comisión por trade | 0.001 | 1 |
| `positionSizePct` | Base de capital por trade | 0.5 | 1 |
| `slMultiplier` | Stop loss en múltiplos de volatilidad | 2 | 3 |
| `tpMultiplier` | Take profit en múltiplos de volatilidad | 3 | 3 |
| `profitFactor` | (métrica) gross profit / gross loss | — | 2 |
| `avgTrade` | (métrica) PnL medio por trade | — | 2 |
| `predictionCorrelation` | (métrica) corr(pred, actual) | — | 5 |

---

## Riesgos y puntos de atención

### Expectativas realistas
Crypto es extremadamente ruidoso. +2–5% mensual es un objetivo realista si se ejecuta correctamente, pero no está garantizado. Incluso bots tipo 2 pueden generar drawdowns de 10–20% en condiciones de alta volatilidad.

### Calibración de confianza y SL/TP
Elegir mal `confidenceThreshold` o los multiplicadores SL/TP puede matar el PnL. Necesitaremos iteración y pruebas forward antes de pasar a dinero real. Cada combinación de parámetros debe validarse con backtests walk-forward y forward tests out-of-sample.

### Paper trading obligatorio
Antes de poner capital real, asegurar que el forward test reproduce condiciones reales (fees, slippage, latencia). Nunca operar en real sin haber validado al menos 2–4 semanas de forward test con PnL consistente.

### Monitoreo y alertas
Logging robusto está incluido en la arquitectura, pero implementar alertas automáticas: si skill score cae < 0 o drawdown > límite configurable → detener bot automáticamente. Cada trade, predicción y error deben quedar registrados.

### Dependencia de datos de calidad
Todo el pipeline depende de que candles y features sean confiables. Un feed con latencia o missing data puede generar trades inesperados. Validar integridad de datos antes de cada sesión de backtest/forward.

### Regla fundamental
**Nunca ejecutar trade directamente desde la predicción**: siempre pasar por filtro de confianza → position sizing → SL/TP → trade decision.

---

## Orden de ejecución

```
PASO 1  →  PASO 2  →  PASO 3  →  PASO 4  →  PASO 5  →  PASO 6  →  PASO 7  →  PASO 8
 params    metrics    SL / TP    sizing     correl.    ensemble    volat.     dir+regime
 1-2 días  0.5 día   2-3 días   1-2 días   1 día      2-3 días   3-5 días   3-4 días
```

Cada paso se puede mergear y testear de forma independiente.
