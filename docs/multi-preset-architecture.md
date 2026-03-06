# Multi-Preset Trading: Arquitectura

## Objetivo

Ejecutar N presets de configuración de trading en paralelo, cada uno con su propia wallet, modelo y parámetros, compartiendo la misma fuente de datos de mercado en tiempo real. Esto permite comparar estrategias, modelos y configuraciones de riesgo side-by-side con datos reales.

---

## 1. Modelo de datos

### 1.1 Tabla `trading_presets`

Reemplaza la tabla `trading_config` de fila única. Cada fila es un preset independiente con:

- ID único (UUID)
- Nombre descriptivo (dado por el usuario)
- Todos los parámetros que hoy tiene `trading_config` (model_snapshot_id, signal_threshold, position_mode, fixed_amount, position_size_pct, active_pairs, signal_timeframe, polling_interval_ms, cooldown_ms, stop_loss_pct, take_profit_pct, max_drawdown_pct)
- Estado: `active` / `paused` / `archived`
- Referencia a su wallet: `wallet_id` (FK a wallets)
- Capital inicial configurado
- Timestamps: created_at, updated_at

### 1.2 Relación Preset → Wallet

Cada preset tiene su propia wallet exclusiva, creada automáticamente al crear el preset. Esto aísla completamente el P&L, balances y trades de cada estrategia.

### 1.3 Relación Preset → Trades

Los trades ya tienen `wallet_id`. Al pertenecer cada preset a una wallet distinta, los trades quedan automáticamente segregados. No hace falta añadir `preset_id` a la tabla de trades.

### 1.4 Migración de datos existentes

Migrar la fila actual de `trading_config` a un preset "Default" con la wallet de simulación existente. Eliminar o deprecar la tabla `trading_config`.

---

## 2. Backend: Gestión de presets

### 2.1 CRUD de presets

Endpoints REST para crear, listar, obtener, actualizar y eliminar presets:

- `POST /v1/trading/presets` — Crea un preset + su wallet asociada (con capital inicial configurable)
- `GET /v1/trading/presets` — Lista todos los presets con estado y métricas resumidas
- `GET /v1/trading/presets/:id` — Detalle de un preset con su config completa
- `PUT /v1/trading/presets/:id` — Actualiza parámetros de un preset
- `DELETE /v1/trading/presets/:id` — Archiva un preset (soft delete) y detiene su simulación
- `POST /v1/trading/presets/:id/activate` — Activa un preset pausado
- `POST /v1/trading/presets/:id/pause` — Pausa un preset activo

### 2.2 Servicio de presets (`PresetService`)

- Carga todos los presets activos al arrancar el módulo
- Expone métodos para obtener, crear, actualizar, activar y pausar presets
- Cache en memoria de todos los presets activos
- Emite eventos internos cuando un preset cambia (para que el motor de simulación reaccione)

---

## 3. Backend: Motor de simulación multi-preset

### 3.1 Refactorización de SimulationService

El `SimulationService` actual gestiona una sola simulación. Refactorizar a un `SimulationOrchestrator` que:

- Al arrancar, lee todos los presets activos y lanza una instancia de simulación por cada uno
- Cada instancia tiene su propio intervalo (según el `polling_interval_ms` del preset), su propio mapa de posiciones, su propio tracking de drawdown
- Al crear/activar un preset, arranca su simulación
- Al pausar/eliminar un preset, detiene su simulación
- Al actualizar un preset, reinicia solo esa simulación con los nuevos parámetros

### 3.2 Instancia de simulación (`PresetSimulationRunner`)

Extraer la lógica actual de `SimulationService` (processPair, executeTrade, stop-loss, take-profit, drawdown) a una clase reutilizable que recibe:

- El preset (con todos sus parámetros)
- El wallet_id del preset
- Dependencias compartidas (market data, execute trade use case, signal service, gateway)

Cada runner es independiente y no comparte estado con otros runners.

### 3.3 Carga de modelos ML por preset

Cada preset puede usar un modelo diferente (`model_snapshot_id`). El `TradingSignalService` debe soportar tener múltiples modelos cargados simultáneamente, o bien cada `PresetSimulationRunner` debe tener su propia instancia de signal service con su modelo cargado.

Evaluar qué es más eficiente en memoria: un pool de modelos compartido con cache (si dos presets usan el mismo modelo, se carga una sola vez) vs una instancia por preset.

### 3.4 Fuente de datos compartida

El market data adapter (Binance WebSocket) debe seguir siendo una instancia única. Los presets solo difieren en qué pares escuchan y con qué parámetros operan, pero la suscripción a precios debe deduplicarse.

El adaptador de mercado ya soporta múltiples suscripciones al mismo par. Verificar que no se dupliquen conexiones WebSocket a Binance cuando varios presets usan el mismo par.

---

## 4. Backend: Métricas y comparación

### 4.1 Métricas por preset en tiempo real

Cada preset acumula sus propias métricas en tiempo real:

- P&L total y porcentual
- Número de trades, win rate
- Max drawdown
- Sharpe ratio (calculable con los trades acumulados)
- Tiempo activo

Estas métricas pueden calcularse on-the-fly a partir de la wallet y los trades, o bien mantenerse en un campo JSONB actualizado periódicamente.

### 4.2 Endpoint de comparación

`GET /v1/trading/presets/compare` — Devuelve una tabla comparativa de todos los presets activos con sus métricas lado a lado. Útil para el frontend.

---

## 5. Backend: WebSocket multi-preset

### 5.1 Eventos segregados por preset

Actualmente el gateway emite `trade_executed` y `portfolio_update` de forma global. Con múltiples presets, el frontend necesita saber a qué preset pertenece cada evento.

Opciones:
- Añadir `presetId` al payload de cada evento emitido
- Usar rooms de Socket.IO: el frontend se suscribe a los presets que quiere observar

La opción de incluir `presetId` en el payload es más simple y suficiente.

### 5.2 Eventos de estado del preset

Emitir eventos cuando un preset cambia de estado (activado, pausado, error). El frontend puede reaccionar mostrando/ocultando indicadores.

---

## 6. Frontend: Gestión de presets

### 6.1 Panel de presets

Reemplazar o complementar la vista actual de trading con un panel que muestre todos los presets como tarjetas o filas de tabla:

- Nombre, estado (activo/pausado), modelo usado
- Métricas resumidas: P&L, trades, win rate, drawdown
- Acciones: activar, pausar, editar, eliminar

### 6.2 Crear/editar preset

Reutilizar el `TradingConfigModal` actual (o adaptarlo) para crear y editar presets. Añadir campo de nombre y capital inicial. El selector de modelo y las 3 secciones (estrategia, ejecución, riesgo) se mantienen.

### 6.3 Vista detalle de preset

Al hacer clic en un preset, mostrar:

- Su gráfico de precios con los trades marcados
- Lista de trades recientes
- Portfolio/balances de su wallet
- Métricas detalladas

Esto es esencialmente la vista actual de trading pero filtrada por un preset concreto.

### 6.4 Vista comparativa

Tabla o dashboard donde se ven todos los presets lado a lado con sus métricas principales. Permite ordenar por cualquier métrica para identificar rápidamente cuál funciona mejor.

### 6.5 Suscripción selectiva a datos en vivo

El frontend debe poder observar uno o varios presets a la vez. Al cambiar de preset seleccionado, se filtran los eventos de WebSocket y los datos mostrados.

---

## 7. Orden de implementación sugerido

1. Modelo de datos: tabla `trading_presets`, migración desde `trading_config`
2. Backend CRUD de presets + servicio
3. Refactorización del SimulationService a orquestador + runners
4. Gestión multi-modelo en TradingSignalService
5. Métricas por preset y endpoint de comparación
6. WebSocket: añadir presetId a eventos
7. Frontend: panel de presets (listar, crear, pausar, eliminar)
8. Frontend: vista detalle de preset (reutilizar componentes existentes)
9. Frontend: vista comparativa
10. Testing y ajustes de rendimiento
