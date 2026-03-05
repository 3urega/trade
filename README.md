# Eurega Quant Research Platform

Simulador de trading crypto con backtesting walk-forward, entrenamiento online de modelos ML y análisis de mercado.

## Arquitectura

```
frontend/       React + Vite + Tailwind
backend/        NestJS (DDD) — módulos Trading y Research
ml-engine/      FastAPI (Python) — SGDRegressor / PassiveAggressive con partial_fit
docker/         Init scripts PostgreSQL
```

**Servicios Docker:**

| Servicio    | Puerto | Descripción                             |
|-------------|--------|-----------------------------------------|
| PostgreSQL  | 5433   | Base de datos principal (pgvector)      |
| Adminer     | 8080   | Gestor web de la base de datos          |
| ML Engine   | 8000   | Motor de predicción Python (FastAPI)    |

---

## Requisitos

- **Node.js** ≥ 20
- **pnpm** ≥ 10
- **Docker** y **Docker Compose**

---

## Arrancar el proyecto en local

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

| Variable            | Descripción                         | Ejemplo                              |
|---------------------|-------------------------------------|--------------------------------------|
| `POSTGRES_USER`     | Usuario de PostgreSQL               | `crypto_user`                        |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL            | (elige una segura)                   |
| `POSTGRES_DB`       | Nombre de la base de datos          | `crypto_simulator`                   |
| `POSTGRES_PORT`     | Puerto de PostgreSQL en el host     | `5433`                               |
| `DATABASE_URL`      | URL de conexión completa            | `postgresql://user:pass@host:port/db`|
| `PORT`              | Puerto del backend                  | `3000`                               |
| `FRONTEND_URL`      | URL del frontend (CORS)             | `http://localhost:5173`              |
| `ML_ENGINE_URL`     | URL del motor ML Python             | `http://localhost:8000`              |
| `ML_ENGINE_PORT`    | Puerto del ML Engine en Docker      | `8000`                               |

### 3. Arrancar todo

```bash
pnpm run dev
```

Este comando levanta Docker Compose (PostgreSQL + Adminer + ML Engine), inicia el backend NestJS en modo watch e inicia el frontend Vite.

**URLs:**

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Swagger docs:** http://localhost:3000/api/docs
- **Adminer (DB):** http://localhost:8080
- **ML Engine:** http://localhost:8000

### Arrancar por partes

```bash
pnpm run docker:up      # Solo Docker (PostgreSQL + Adminer + ML Engine)
pnpm run dev:backend    # Solo backend (requiere Docker levantado)
pnpm run dev:frontend   # Solo frontend
```

---

## Base de datos y migraciones

### Ejecutar migraciones

Las migraciones crean todas las tablas. Hay que ejecutarlas después de levantar Docker por primera vez (o cuando la base esté vacía).

```bash
pnpm run docker:up
pnpm run build:backend
pnpm run migration:run
```

Las tablas que se crean son:

| Tabla                | Módulo   | Descripción                                    |
|----------------------|----------|------------------------------------------------|
| `wallets`            | Trading  | Wallets de paper trading                       |
| `trades`             | Trading  | Trades ejecutados                              |
| `market_snapshots`   | Trading  | Snapshots de precios (pgvector)                |
| `historical_candles` | Research | Velas OHLCV históricas de Binance              |
| `backtest_sessions`  | Research | Sesiones de backtesting con métricas           |
| `predictions`        | Research | Predicciones individuales por sesión           |

### Conectar con DBeaver

1. Levanta Docker: `pnpm run docker:up`
2. Nueva conexión **PostgreSQL**:

| Campo    | Valor                                              |
|----------|----------------------------------------------------|
| Host     | `localhost`                                        |
| Port     | El de `POSTGRES_PORT` en `.env` (ej. `5433`)       |
| Database | El de `POSTGRES_DB` (ej. `crypto_simulator`)       |
| Username | El de `POSTGRES_USER` (ej. `crypto_user`)          |
| Password | El de `POSTGRES_PASSWORD`                          |

SSL desactivado en desarrollo local.

### Si al reiniciar Docker no ves tablas

Si usaste `docker compose down -v`, la opción `-v` borra los volúmenes incluido PostgreSQL. Para no perder datos usa siempre `docker compose down` (sin `-v`). Si la base ya está vacía, vuelve a ejecutar las migraciones.

### Revertir la última migración

```bash
pnpm run migration:revert
```

---

## Módulo Trading (simulación en tiempo real)

El módulo Trading simula operaciones de paper trading con precios reales de Binance.

**Qué hace:**

- Un bot (`SimulationService`) ejecuta trades automáticos cada 5 segundos en BTC/ETH/SOL usando precios reales de Binance.
- El frontend muestra el portfolio (valor total, P&L, balances), un gráfico de precios por par y la tabla de trades recientes, todo actualizado en tiempo real via WebSocket.
- El wallet del bot se crea automáticamente al arrancar el backend; el frontend lo descubre solo.

**Endpoints principales:**

```
POST /v1/wallets              Crear un wallet
POST /v1/trades               Ejecutar un trade manual
GET  /v1/trades               Listar trades
GET  /v1/portfolio/:walletId  Ver portfolio con valor en USDT y P&L
```

**Datos simulados vs datos reales de Binance:**

| Parte | Simulado | De Binance |
|-------|----------|------------|
| Bot automático | Qué par, BUY/SELL y cantidad | Precio de ejecución |
| Portfolio | Nada | Precio actual de cada moneda |
| Trade manual sin `price` | Nada | Precio en el momento de la petición |

---

## Módulo Research (backtesting + ML)

El módulo Research permite cargar datos históricos de Binance y entrenar modelos de predicción con validación walk-forward.

### Flujo completo

```
1. Cargar velas históricas (OHLCV) entre dos fechas
2. Ejecutar un backtest walk-forward:
   - Para cada vela, entrenar el modelo con partial_fit
   - Predecir el siguiente cierre
   - Comparar contra el valor real
   - Acumular métricas (MAE, RMSE, Directional Accuracy)
3. Ver resultados: métricas + gráfico actual vs predicho
```

### Endpoints

```
POST /v1/research/candles/load    Descargar velas de Binance y guardarlas
POST /v1/research/backtest        Ejecutar un backtest
GET  /v1/research/backtest        Listar sesiones pasadas
GET  /v1/research/backtest/:id    Ver sesión con métricas (y predicciones con ?predictions=true)
```

### Desde la UI

En el frontend, pestaña **Research**:

1. **Load Historical Data** — selecciona símbolo, timeframe y rango de fechas. Descarga y guarda las velas en la base de datos.
2. **Run Backtest** — configura símbolo, timeframe, fechas, modelo y warmup period. El backend ejecuta el loop walk-forward y devuelve las métricas.
3. **Past Sessions** — lista de backtests anteriores. Haz clic en uno para ver métricas y el gráfico actual vs predicho.

### Modelos disponibles

| Modelo | Descripción |
|--------|-------------|
| `sgd_regressor` | SGDRegressor de scikit-learn (default) |
| `passive_aggressive` | PassiveAggressiveRegressor de scikit-learn |

Ambos soportan `partial_fit` (entrenamiento incremental). Para añadir más modelos basta con registrarlos en `ml-engine/app.py`.

### Features que usa el modelo (5 features)

| Feature | Descripción |
|---------|-------------|
| `close / 1000` | Precio de cierre normalizado |
| `log return vs prev` | Retorno logarítmico respecto a la vela anterior |
| `log return vs -5` | Retorno logarítmico respecto a 5 velas atrás |
| `relative volatility` | Desviación estándar de los últimos 5 cierres / cierre actual |
| `norm volume` | Volumen normalizado por el máximo de las últimas 5 velas |

### ML Engine

El motor ML corre en un contenedor Docker separado (Python + FastAPI). El backend NestJS se comunica con él via HTTP; el dominio no sabe nada de sklearn.

```
POST /initialize     Inicializa/resetea el modelo
POST /partial-train  Entrena con una muestra (expanding window)
POST /predict        Predice dado un feature vector
GET  /health         Estado del servicio
```

---

## Scripts disponibles

| Script                      | Descripción                                      |
|-----------------------------|--------------------------------------------------|
| `pnpm run dev`              | Docker + backend + frontend en modo desarrollo   |
| `pnpm run docker:up`        | Levanta todos los contenedores Docker            |
| `pnpm run docker:down`      | Para los contenedores (sin borrar volúmenes)     |
| `pnpm run docker:logs`      | Ver logs de los contenedores                     |
| `pnpm run dev:backend`      | Solo backend (modo watch)                        |
| `pnpm run dev:frontend`     | Solo frontend (Vite)                             |
| `pnpm run build`            | Compila backend y frontend                       |
| `pnpm run build:backend`    | Compila solo el backend                          |
| `pnpm run build:frontend`   | Compila solo el frontend                         |
| `pnpm run migration:run`    | Ejecuta migraciones pendientes                   |
| `pnpm run migration:revert` | Revierte la última migración                     |
| `pnpm run lint`             | Lint en todos los paquetes                       |

---

## Estructura del proyecto

```
markets/
├── backend/                    NestJS API (DDD)
│   └── src/
│       ├── modules/
│       │   ├── trading/        Bounded context: paper trading en tiempo real
│       │   └── research/       Bounded context: backtesting + ML
│       ├── migrations/         Migraciones TypeORM
│       └── shared/             Base classes (Entity, ValueObject, AggregateRoot, Result)
├── frontend/                   React + Vite + Tailwind
│   └── src/
│       ├── components/
│       │   ├── research/       UI del módulo Research
│       │   └── ...             UI del módulo Trading
│       ├── services/           API calls y WebSocket
│       └── types/              Tipos TypeScript compartidos
├── ml-engine/                  Motor ML Python
│   ├── app.py                  FastAPI con partial_fit (sklearn)
│   ├── requirements.txt
│   └── Dockerfile
├── docker/                     Init scripts PostgreSQL (pgvector, uuid-ossp)
├── docker-compose.yml
└── .env.example
```
