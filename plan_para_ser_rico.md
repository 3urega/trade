# Plan para ser rico — Transformar Markets en la mejor app de finanzas del mundo

> Basado en `feedback.md` y `mas_feedback.md`. Objetivo: pasar de plataforma de research a **trading decision engine** profesional.

---

## Diagnóstico del feedback

### Lo que está bien
- Pipeline correcto: `candles → features → ML → señal → PnL`
- Backtests walk-forward, forward tests, `partial_fit`
- Skill Score como métrica de mejora vs naive

### Los 6 problemas identificados

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Target difícil**: predecir `log_return` ≈ predecir ruido en crypto | Bot casi siempre hace HOLD |
| 2 | **Trade en cada predicción**: sin filtro de confianza mínima | Comisiones y slippage destrozan el PnL |
| 3 | **Sin position sizing dinámico**: posición fija al 50% siempre | Arriesga igual cuando el modelo duda |
| 4 | **Sin stop loss / take profit**: solo cierra cuando cambia señal | Drawdowns descontrolados |
| 5 | **Un solo modelo**: errores de overfitting y ruido alto | Señal poco robusta |
| 6 | **Sin correlación señal-real**: no sabemos si hay edge | No podemos validar si el modelo sirve |

### El error conceptual más importante

El feedback lo describe como *"el error que mata al 90% de los bots de ML"*:

> El modelo predice → esa predicción se convierte en BUY/SELL directamente → el bot ejecuta un trade cada vez que cambia la predicción.

Incluso un modelo con Skill Score > 0 genera **mucho ruido** en timeframes cortos. Ejecutar trades en cada cambio de predicción amplifica errores con comisiones, slippage y micro-movimientos.

| Sistema actual | Sistema corregido |
|----------------|-------------------|
| Trade en cada predicción | Trade solo si `confidence > threshold` |
| Size fijo (50%) | Size proporcional a confianza |
| Sin stops | Stop/TakeProfit dinámicos basados en volatilidad |
| 1 modelo | Ensemble de 3+ modelos |

---

## Arquitectura objetivo

```
candles
   ↓
feature engineering
   ↓
[3 modelos ML en ensemble]
   ↓
probabilidad final (media de prob_up de los 3)
   ↓
position sizing dinámico (basePosition × confidence)
   ↓
stop loss y take profit dinámicos (basados en volatilidad)
   ↓
trade decision
   ↓
métricas: profit, maxDrawdown, sharpeRatio, winRate, profitFactor
```

---

## Fases del plan

---

### FASE 0 — Quick wins (1–2 días)

Objetivo: mejorar el sistema sin cambiar el modelo.

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 0.1 | **Filtro de confianza mínima** | `TradingSimulation`, `RunForwardTestDto`, `ForwardTestForm.tsx` | Añadir `confidenceThreshold`: solo abrir trade si `abs(predictedReturn) / scale > threshold`. Reduce operaciones inútiles. El `signalThreshold` actual hace esto pero no está expuesto en la UI; exponer junto con `positionSizePct` y `feeRate`. |
| 0.2 | **Correlación predicción vs real** | `run-backtest.use-case.ts`, `BacktestSessionResponseDto` | Calcular `corr(predicted_return, actual_return)` al final del backtest. Mostrar en UI: si > 0.05 → hay señal potencial. |
| 0.3 | **Gráfico predicted vs actual** | Frontend, `BacktestResults` | Scatter plot: eje X = predicted log return, eje Y = actual. Correlación visual = evidencia de edge. |

---

### FASE 1 — Stop loss y take profit dinámicos (2–3 días)

Objetivo: no más posiciones sin límite de pérdida.

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 1.1 | **Stop loss basado en volatilidad** | `TradingSimulation`, `RunForwardTestDto` | `stopLoss = entryPrice - (2 × localVolatility)`. La feature `local_volatility` ya existe en el feature vector. |
| 1.2 | **Take profit basado en volatilidad** | `TradingSimulation` | `takeProfit = entryPrice + (3 × localVolatility)`. Ratio 1.5:1 riesgo/beneficio por defecto. |
| 1.3 | **Check SL/TP en cada tick** | `TradingSimulation.processTick()` | Antes de evaluar la señal ML, comprobar si el precio actual toca stop o take profit. Cerrar y registrar el resultado. |
| 1.4 | **Parámetros ajustables** | DTOs y UI | `slMultiplier` (default 2) y `tpMultiplier` (default 3) configurables desde el formulario. |

---

### FASE 2 — Position sizing dinámico (2–3 días)

Objetivo: arriesgar más cuando el modelo está seguro, menos cuando duda.

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 2.1 | **Cálculo de confianza** | `TradingSimulation.processTick()` | `confidence = Math.abs(predictedSignal - 0) × escalar` (para el modelo actual de log_return). Con clasificador: `confidence = Math.abs(prob_up - 0.5) × 2`. Resultado en [0, 1]. |
| 2.2 | **Position size dinámico** | `TradingSimulation.processTick()` | `positionSize = basePositionSizePct × confidence`. Ejemplo: `basePosition=0.5`, `confidence=0.3` → posición del 15% del capital. |
| 2.3 | **Parámetro `basePositionSizePct`** | DTOs y UI | Reemplaza el `positionSizePct` fijo actual. |

---

### FASE 3 — Ensemble de modelos (2–3 días)

Objetivo: combinar varios modelos para reducir ruido y overfitting.

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 3.1 | **Endpoint `/predict-ensemble`** | `ml-engine/app.py` | Recibe features y devuelve la **media de predicciones** de todos los modelos activos en sesión (SGD + PassiveAggressive + MLP). |
| 3.2 | **Votación ponderada** | `ml-engine/app.py` | Para regresores: `avgPrediction = mean([pred_sgd, pred_pa, pred_mlp])`. Para clasificadores (futuro): `avgProbUp = mean([prob_sgd, prob_pa, prob_mlp])`. |
| 3.3 | **Backend: entrenar 3 modelos** | `run-backtest.use-case.ts` | Inicializar y entrenar los 3 modelos (SGD, PassiveAggressive, MLP) en el mismo loop walk-forward. Guardar snapshot de los 3. |
| 3.4 | **Forward test con ensemble** | `run-forward-test.use-case.ts` | Cargar 3 snapshots, llamar `/predict-ensemble`, usar `avgPrediction` para la señal. |

---

### FASE 4 — Modelo de volatilidad (3–5 días)

Objetivo: cambiar el target de regresión a clasificación — *¿habrá movimiento grande?*

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 4.1 | **Enum `PredictionMode`** | `backend/domain/`, DTOs, frontend | `RETURN` (actual) \| `VOLATILITY` \| `DIRECTION` \| `REGIME`. |
| 4.2 | **SGDClassifier en ML Engine** | `ml-engine/app.py` | `SGDClassifier(loss="log_loss")` con `partial_fit`. Endpoint `POST /train-classifier` y `POST /predict-proba`. |
| 4.3 | **Target volatilidad** | `run-backtest.use-case.ts` | `move = abs(close[i+1]-close[i])/close[i]`; `target = move > VOLATILITY_THRESHOLD ? 1 : 0` (ej. 0.002). |
| 4.4 | **Lógica por probabilidad** | `run-forward-test.use-case.ts` | `if prob_move > 0.65 → trade`. Dirección: momentum simple o modelo de dirección (Fase 5). |

---

### FASE 5 — Modelo de dirección + régimen (3–4 días)

Objetivo: complementar la volatilidad con decisión de dirección y filtro de régimen.

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 5.1 | **Modelo de dirección** | `ml-engine/app.py`, `run-backtest.use-case.ts` | Target: `sign(close[i+1]-close[i])` → 1/0. `prob_up = predict_proba(direction_model)`. |
| 5.2 | **Modelo de régimen** | `ml-engine/app.py`, `run-backtest.use-case.ts` | Target: `abs(EMA20-EMA50)/close > threshold ? 1 : 0`. |
| 5.3 | **Decisión triple** | `run-forward-test.use-case.ts` | `if prob_move < 0.65 → HOLD`; `if prob_trend < 0.5 → HOLD`; `if prob_up > 0.55 → BUY else SELL`. |

---

### FASE 6 — Métricas y UX (1–2 días)

| # | Cambio | Archivos | Descripción |
|---|--------|----------|-------------|
| 6.1 | **Métricas trading en backtest** | `BacktestSession`, `BacktestSessionResponseDto` | `profit`, `maxDrawdown`, `sharpeRatio`, `winRate`, `profitFactor`, `avgTrade` visibles en UI. |
| 6.2 | **Dashboard de comparación** | Frontend, `ResearchPage` | Tabla de experimentos con Sharpe, profit factor, correlación, ordenable por métrica. |
| 6.3 | **Perfiles de riesgo** | Frontend | Conservador (SL 1%, position 20%) / Equilibrado / Agresivo (SL 3%, position 50%) como presets. |

---

## Orden de implementación recomendado

| Orden | Fase | Esfuerzo | Impacto |
|-------|------|----------|---------|
| 1 | Fase 0: parámetros + correlación | Bajo | Alto (diagnóstico inmediato) |
| 2 | Fase 1: stop loss / take profit | Medio | Muy alto (limita pérdidas) |
| 3 | Fase 2: position sizing dinámico | Medio | Alto (reduce drawdown) |
| 4 | Fase 3: ensemble de modelos | Medio | Alto (reduce ruido) |
| 5 | Fase 4: modelo de volatilidad | Medio-alto | Muy alto (cambio de paradigma) |
| 6 | Fase 5: dirección + régimen | Alto | Alto |
| 7 | Fase 6: métricas y UX | Bajo | Medio |

---

## Archivos clave a modificar

| Componente | Archivos |
|------------|----------|
| ML Engine | `ml-engine/app.py` |
| Backtest | `backend/.../run-backtest.use-case.ts`, `RunBacktestDto` |
| Forward test | `backend/.../run-forward-test.use-case.ts`, `RunForwardTestDto` |
| Simulación | `backend/.../trading-simulation.ts` |
| Métricas | `BacktestSession`, `BacktestSessionResponseDto`, `TradingMetrics` |
| Frontend | `RunBacktestForm.tsx`, `ForwardTestForm.tsx`, resultados |

---

## Criterios de éxito

- **Correlación > 0.05** entre predicción y retorno real en backtest
- **Skill Score > 0** (modelo mejor que naive) en walk-forward
- **Max drawdown < 20%** con stop loss activo
- **Sharpe ratio > 0.5** en forward test con ensemble
- **Win rate > 50%** y **profit factor > 1.2** con triple modelo

---

## La frase clave del feedback

> *"La IA no decide comprar o vender directamente. Estima probabilidades. Luego el bot aplica gestión de riesgo, reglas de trading y capital management."*

**El objetivo realista**: +2% a +5% mensual consistente — que es exactamente lo que buscan los fondos cuantitativos.
