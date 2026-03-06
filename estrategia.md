# Estrategia de modelos de predicción y forward tests

Este documento resume cómo se entrenan y evalúan los modelos hoy, qué parámetros tienen los que ya existen, qué forward tests se han hecho y con qué parámetros, y propone una estrategia para mantener un **conjunto de modelos** y decidir cuál va dando mejor resultado. Incluye sugerencias de parámetros por perfil de riesgo (alto riesgo, bajo riesgo, equilibrio seguridad/riesgo).

---

## 1. Cómo entrenamos los modelos hoy

### 1.1 Pipeline

1. **Carga de datos**: `POST /v1/research/candles/load` — descarga velas (Binance) y guarda en `historical_candles` por `(symbol, timeframe, openTime)`.
2. **Backtest (entrenamiento walk-forward)**: `POST /v1/research/backtest` — para cada vela en el rango:
   - Se construyen **features** con datos hasta la vela actual (sin futuro).
   - **Primero se predice** el cierre de la vela siguiente (log-return).
   - Se compara con el valor real y se registran métricas (MAE, dirección correcta, etc.).
   - **Después** se entrena con `partial_fit(features, target)`.
   - Al final se guarda un **snapshot del modelo** en el ML engine (y su ID en la sesión).
3. **Forward test**: `POST /v1/research/forward-test` — se carga el modelo de un backtest completado y se simula **solo predicción** (sin entrenar) en un rango de fechas **posterior** al backtest (out-of-sample). Se aplica lógica BUY/SELL/HOLD y se calculan P&L, drawdown, Sharpe, win rate.

No hay data leakage: el modelo nunca ve el target de la vela actual antes de predecirla.

### 1.2 Parámetros del backtest (lo que queda guardado)

| Parámetro       | Dónde se usa / guarda | Valores típicos |
|-----------------|------------------------|-----------------|
| **symbol**      | DB, sesión             | `BTCUSDT`, `ETHUSDT` |
| **timeframe**   | DB, sesión             | `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| **from / to**   | Rango de velas         | Dentro del rango cargado en `historical_candles` |
| **modelType**   | ML engine + sesión     | `sgd_regressor`, `passive_aggressive` |
| **warmupPeriod** | Cálculo de `startIndex` | 5–200 (por defecto 20) |

En la base de datos, cada fila de `backtest_sessions` tiene: `id`, `symbol`, `timeframe`, `start_date`, `end_date`, `model_type`, `warmup_period`, `status`, `metrics` (JSONB), `session_type` (BACKTEST/FORWARD_TEST), `model_snapshot_id`, `source_session_id` (solo en forward tests), `trading_metrics` (JSONB, solo en forward tests), `created_at`, `completed_at`, `error_message`.

---

## 2. Parámetros de los modelos ya entrenados (ML engine)

Los modelos se definen en `ml-engine/app.py`. **No se guardan hiperparámetros en la base de datos**; el snapshot guarda el modelo serializado y metadata mínima (`model_type`, `train_count`, `feature_names`, `saved_at`). Los parámetros fijos son:

### 2.1 SGD Regressor (`sgd_regressor`)

- `loss="squared_error"`
- `penalty="l2"`
- `alpha=0.0001` (regularización)
- `max_iter=1`, `tol=None`, `warm_start=True`, `random_state=42`

### 2.2 Passive Aggressive Regressor (`passive_aggressive`)

- `C=0.1` (agresividad de actualización)
- `max_iter=1`, `tol=None`, `warm_start=True`, `random_state=42`

### 2.3 Features (14)

`relative_range`, `log_return_1`, `log_return_5`, `local_volatility`, `norm_volume`, `rsi_14`, `ema_ratio_short`, `ema_ratio_long`, `macd_norm`, `bb_position`, `log_return_10`, `log_return_20`, `volume_ratio`, `body_ratio`. Requieren al menos 26 velas de historia.

### 2.4 Modelos no lineales (actualmente no implementados)

**Hoy solo hay modelos lineales.** SGDRegressor y PassiveAggressiveRegressor son regresores lineales: la predicción es una combinación lineal de las features. Para capturar relaciones no lineales (interacciones entre indicadores, patrones más complejos) hace falta ampliar el ML engine con modelos no lineales.

| Tipo | Ejemplos | `partial_fit` en sklearn | Comentario |
|------|----------|---------------------------|------------|
| **Lineal** | SGDRegressor, PassiveAggressive | ✅ Sí | Ya implementados. |
| **Red neuronal** | MLPRegressor | ✅ Sí | Escalable a muchas features, puede capturar no linealidad. |
| **Árboles / ensemble** | RandomForest, XGBoost, LightGBM | ❌ No (RF) / Parcial (GBM) | No tienen `partial_fit` estándar; requieren otro esquema de entrenamiento. |
| **Series temporales** | LSTM, TCN | Depende del framework | PyTorch/TF; entrenamiento por lotes, no incremental nativo. |

**Restricción del pipeline actual:** el backtest usa `partial_fit` en cada vela (entrenamiento incremental walk-forward). Cualquier modelo nuevo debe poder entrenarse de forma incremental, o habría que cambiar el esquema (p. ej. reentrenar cada N velas en batch).

**Modelos no lineales recomendados para añadir:**

1. **MLPRegressor** (sklearn): tiene `partial_fit`, es el siguiente paso natural. Parámetros a probar: `hidden_layer_sizes`, `learning_rate_init`, `alpha` (regularización).
2. **LightGBM / XGBoost**: no tienen `partial_fit`, pero se pueden usar con **reentrenamiento periódico** (p. ej. cada 100–500 velas) en lugar de cada vela. Cambiaría el use case de backtest para soportar ese modo.
3. **LSTM / redes recurrentes**: para patrones temporales largos; requieren ventanas de secuencia y otro pipeline (no una sola fila de features por vela).

Cuando añadas modelos no lineales, la estrategia de conjunto (sección 5) debe incluir también variaciones de `modelType` (lineal vs MLP vs GBM) y sus hiperparámetros, manteniendo el mismo criterio: comparar en un **mismo** forward test con métricas de P&L, Sharpe y drawdown.

---

## 3. Forward tests: qué se ha hecho y con qué parámetros

### 3.1 Dónde ver lo guardado

- **Backtests**: tabla `backtest_sessions` con `session_type = 'BACKTEST'`, `status = 'COMPLETED'`, y `model_snapshot_id` no nulo.
- **Forward tests**: mismas tabla con `session_type = 'FORWARD_TEST'` y `source_session_id` apuntando al backtest del que sale el modelo.
- **API**: `GET /v1/trading/available-models` devuelve cada backtest con snapshot y la lista de forward tests asociados (sessionId, from, to, initialCapital, totalReturn, totalReturnPct, totalTrades, winRate, sharpeRatio, maxDrawdown).

Para **analizar lo que ya tienes** en la base de datos puedes usar, por ejemplo:

```sql
-- Backtests completados con modelo guardado
SELECT id, symbol, timeframe, start_date, end_date, model_type, warmup_period,
       metrics->>'skillScore' AS skill_score,
       metrics->>'directionalAccuracy' AS dir_acc,
       model_snapshot_id, created_at
FROM backtest_sessions
WHERE session_type = 'BACKTEST' AND status = 'COMPLETED' AND model_snapshot_id IS NOT NULL
ORDER BY completed_at DESC;

-- Forward tests con métricas de trading
SELECT id, source_session_id, start_date, end_date,
       trading_metrics->>'totalPnl' AS pnl,
       trading_metrics->>'totalPnlPercent' AS pnl_pct,
       trading_metrics->>'totalTrades' AS trades,
       trading_metrics->>'winRate' AS win_rate,
       trading_metrics->>'sharpeRatio' AS sharpe,
       trading_metrics->>'maxDrawdown' AS max_dd
FROM backtest_sessions
WHERE session_type = 'FORWARD_TEST'
ORDER BY created_at DESC;
```

### 3.2 Parámetros actuales del forward test

En el código (`run-forward-test.use-case.ts` y `forward-test-result.ts`) los parámetros de la **simulación de trading** están **fijos**:

| Parámetro            | Valor actual | Efecto |
|----------------------|-------------|--------|
| **SIGNAL_THRESHOLD** | `0.0005`    | Log-return mínimo para abrir/cerrar (más bajo → más operaciones, más riesgo). |
| **FEE_RATE**         | `0.001`     | Comisión por operación (0,1%). |
| **POSITION_SIZE_PCT**| `0.5`       | Porcentaje del capital en cada posición (50%). |
| **initialCapital**  | `10000` (o el que envíes en el DTO) | Solo escala P&L. |

Hoy **no** se pueden variar desde la API: no hay “forward test conservador” vs “agresivo” en la misma corrida. Para tener distintos perfiles de riesgo hay que **hacer configurables** estos parámetros en el DTO y en la simulación (ver sección 5).

---

## 4. Métricas que ya guardamos y cómo usarlas

### 4.1 Backtest (predicción)

- **MAE, RMSE, MAPE** (precio y return).
- **Directional accuracy** (% de veces que la dirección predicha coincide con la real).
- **Skill Score** = `1 - (MAE_modelo / MAE_naive)`. > 0 implica que el modelo mejora al baseline “predecir que no hay cambio”.
- **Sharpe ratio** (simulado por predicción de dirección).

### 4.2 Forward test (trading simulado)

- **totalPnl**, **totalPnlPercent**, **totalTrades**, **winRate**, **maxDrawdown**, **maxDrawdownPercent**, **sharpeRatio**.
- **trading_metrics** en JSONB en `backtest_sessions` para cada sesión de tipo FORWARD_TEST.

La **métrica clave para “qué modelo va mejor”** en out-of-sample es el resultado del **forward test** (P&L, Sharpe, drawdown), no solo el Skill Score del backtest (que puede ser optimista). Conviene comparar varios modelos sobre el **mismo** rango de fechas de forward test.

---

## 5. Estrategia propuesta: conjunto de modelos y perfiles de riesgo

### 5.1 Objetivo

- Mantener un **conjunto de modelos** (varios backtests con distintos parámetros).
- Para cada modelo, ejecutar **varios forward tests** (mismo periodo out-of-sample) con **distintos parámetros de riesgo**.
- Decidir cuál “va mejor” según P&L, Sharpe y drawdown en forward test, y opcionalmente Skill Score / directional accuracy en backtest.

### 5.2 Parámetros con los que “jugar” hoy (sin tocar código)

- **modelType**: `sgd_regressor` vs `passive_aggressive`.
- **warmupPeriod**: por ejemplo 20, 50, 100 (más warmup = menos predicciones evaluadas, modelo más “estable” al inicio).
- **timeframe**: `1h`, `4h`, `1d` (más datos por vela, menos ruido que `1m`/`5m`).
- **Ventana de fechas**: distintos rangos from/to para entrenar (p. ej. solo bull, solo bear, mixto) y **un mismo** rango posterior para todos los forward tests.

Con eso ya puedes hacer una “rejilla” mínima:

- 2 modelos × 2–3 warmups × 1–2 timeframes × 1–2 ventanas de entrenamiento → varios backtests.
- Para cada backtest completado, 1 forward test (mismo periodo) con los parámetros actuales.

### 5.3 Parámetros de riesgo (cuando los hagas configurables)

Para tener **un perfil de mucho riesgo, otro de menos y uno equilibrado**, lo más útil es hacer configurables en el **forward test** (y luego en trading real) estos parámetros:

| Parámetro             | Conservador (menos riesgo) | Equilibrado | Agresivo (más riesgo) |
|-----------------------|-----------------------------|-------------|------------------------|
| **signal_threshold**  | Mayor, p. ej. `0.002`       | `0.0005` (actual) | Menor, p. ej. `0.0002` |
| **position_size_pct** | Bajo, p. ej. `0.2`–`0.3`    | `0.5` (actual)     | Alto, p. ej. `0.7`–`0.8` |
| **fee_rate**          | Dejar `0.001` o parametrizar si quieres simular distintos exchanges. | | |

- **signal_threshold alto** → menos señales, menos operaciones, menos exposición y normalmente menos drawdown.
- **signal_threshold bajo** → más operaciones, más sensibilidad al ruido, más riesgo.
- **position_size_pct** controla cuánto capital se arriesga por trade (conservador = menor tamaño).

Recomendación: añadir al `RunForwardTestDto` (y a la simulación) algo como:

- `signalThreshold?: number` (default `0.0005`)
- `positionSizePct?: number` (default `0.5`)

y, si quieres, `feeRate?: number`. Así podrás lanzar para el **mismo** backtest tres forward tests: conservador, equilibrado y agresivo, y comparar P&L, Sharpe y max drawdown.

### 5.4 Conjunto de modelos sugerido

**Hoy (solo lineales):**

1. **Variar modelo y warmup**
   - Backtest A: `sgd_regressor`, warmup 20.
   - Backtest B: `sgd_regressor`, warmup 50.
   - Backtest C: `passive_aggressive`, warmup 20.
   - Backtest D: `passive_aggressive`, warmup 50.

**Cuando añadas modelos no lineales** (MLPRegressor, LightGBM, etc.; ver sección 2.4):

- Incluir en la misma rejilla: p. ej. Backtest E: `mlp_regressor` (o el nombre que uses), warmup 50; Backtest F: `lightgbm` con reentrenamiento cada N velas, etc.
- Comparar **lineal vs no lineal** en el mismo forward test: a veces los lineales generalizan mejor por ser más simples; otras veces el no lineal captura patrones que el lineal no ve.
- Variar hiperparámetros del no lineal (p. ej. `hidden_layer_sizes` en MLP, `num_leaves` en LightGBM) como haces con `warmupPeriod` en los lineales.

2. **Mismo símbolo y timeframe** (p. ej. BTCUSDT 1h) y **misma ventana de entrenamiento** (p. ej. 2024-01-01 a 2024-10-01).

3. **Un solo periodo de forward test** para todos (p. ej. 2024-10-01 a 2025-01-01). Cargar antes esas velas con Load Historical Data.

4. **Comparar** en ese mismo periodo:
   - Skill Score y directional accuracy del backtest (solo referencia).
   - Por forward test: PnL %, Sharpe, max drawdown %, win rate, número de trades.

5. **Elegir** el modelo (o los dos mejores) que en forward test den mejor relación retorno/drawdown o mejor Sharpe, y usarlos en paper/live con el perfil de riesgo que prefieras (conservador/equilibrado/agresivo) según los tests con `signalThreshold` y `positionSizePct`.

### 5.5 Repetir en el tiempo

- Cada X tiempo (p. ej. mensual), añadir nuevo rango de datos, re-ejecutar backtests (o solo los que quieras) con ventana actualizada y nuevo forward test en el periodo más reciente.
- Mantener una tabla o vista “mejor modelo por periodo” (por ejemplo por mes) para ver degradación o mejora.

---

## 6. Resumen de acciones recomendadas

1. **Consulta la base de datos** con las queries de la sección 3.1 para listar backtests y forward tests ya guardados y sus métricas.
2. **Fija un periodo de forward test común** (mismo from/to) y ejecuta al menos 2–4 backtests variando `modelType` y `warmupPeriod` (y opcionalmente timeframe).
3. **Lanza un forward test por cada backtest** en ese periodo y compara P&L %, Sharpe, max drawdown.
4. **Hacer configurables** en el forward test `signalThreshold` y `positionSizePct` (y opcionalmente `feeRate`) para poder correr tres perfiles (conservador, equilibrado, agresivo) por modelo.
5. **Documentar** en una hoja o dashboard qué combinación (modelo + warmup + perfil de riesgo) va mejor en cada ventana temporal y usar esa información para elegir el modelo y la configuración en vivo.

Con esto tendrás un conjunto de modelos claramente comparables y una estrategia para decidir cuál va dando mejor resultado y con qué nivel de riesgo operar.
