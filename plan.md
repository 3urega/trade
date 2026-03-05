Implementar modulo Research: Backtest + ML Engine

Arquitectura objetivo

flowchart TB
  subgraph frontend [Frontend React]
    ResearchUI["Research UI"]
  end

  subgraph backend [Backend NestJS]
    subgraph research [Research Module]
      LoadCandles["LoadHistoricalDataUseCase"]
      RunBacktest["RunBacktestUseCase"]
      GetBacktest["GetBacktestUseCase"]
    end
    subgraph ports [Ports]
      CandleRepo["CandleRepositoryPort"]
      BacktestRepo["BacktestRepositoryPort"]
      MlPort["MlServicePort"]
    end
  end

  subgraph mlEngine [ML Engine - Python FastAPI]
    Init["/initialize"]
    Train["/partial-train"]
    Predict["/predict"]
  end

  subgraph db [PostgreSQL]
    candles["historical_candles"]
    sessions["backtest_sessions"]
    predictions["predictions"]
  end

  ResearchUI -->|"POST /v1/research/candles/load"| LoadCandles
  ResearchUI -->|"POST /v1/research/backtest"| RunBacktest
  ResearchUI -->|"GET /v1/research/backtest/:id"| GetBacktest
  LoadCandles --> CandleRepo
  RunBacktest --> CandleRepo
  RunBacktest --> MlPort
  RunBacktest --> BacktestRepo
  MlPort -->|HTTP| Init
  MlPort -->|HTTP| Train
  MlPort -->|HTTP| Predict
  CandleRepo --> candles
  BacktestRepo --> sessions
  BacktestRepo --> predictions

Flujo walk-forward (loop del RunBacktestUseCase)

sequenceDiagram
  participant UC as RunBacktestUseCase
  participant ML as MlServicePort
  participant DB as CandleRepository

  UC->>ML: initialize(model_type)
  UC->>DB: getCandles(symbol, from, to)
  loop cada vela i desde warmup hasta N-1
    UC->>ML: partialTrain(features[i], target[i])
    UC->>ML: predict(features[i])
    UC->>UC: calcular error vs candles[i+1].close
    UC->>UC: acumular metricas (MAE, RMSE, dirAccuracy)
  end
  UC->>DB: guardar BacktestSession + PredictionRecords



Fase 1: Dominio Research (NestJS)

Nuevo bounded context en backend/src/modules/research/ siguiendo la misma estructura que trading/:

Entidades





BacktestSession (AggregateRoot) -- id, symbol, timeframe, startDate, endDate, status (CREATED/RUNNING/COMPLETED/FAILED), metrics (BacktestMetrics), createdAt



PredictionRecord (Entity) -- id, sessionId, timestamp, predicted, actual, error

Value Objects





Candle -- symbol, openTime, open, high, low, close, volume



BacktestMetrics -- mae, mse, rmse, directionalAccuracy, totalPredictions. Metodo registerPrediction(predicted, actual) que recalcula acumulativamente.



PredictionError -- static from(predicted, actual) calcula absoluteError, squaredError, directionCorrect



FeatureVector -- wrapper sobre number[] con los features que se envian a Python



Timeframe -- enum: 1m, 5m, 15m, 1h, 4h, 1d

Ports (interfaces)





CandleRepositoryPort -- save(candles), findBySymbolAndRange(symbol, from, to, timeframe)



BacktestRepositoryPort -- save(session), findById(id), findAll()



PredictionRepositoryPort -- saveBatch(records), findBySessionId(id)



MlServicePort -- initialize(modelType), partialTrain(x, y), predict(x) -- el dominio no sabe de sklearn

Enums





BacktestStatus -- CREATED, RUNNING, COMPLETED, FAILED



ModelType -- SGD_REGRESSOR, PASSIVE_AGGRESSIVE (modelos con partial_fit)



Fase 2: Application Layer (use cases)

LoadHistoricalDataUseCase





Recibe: { symbol, from, to, timeframe }



Usa el MarketDataPort existente de trading (metodo getHistoricalPrices) o un nuevo metodo en el adapter de Binance para klines



Mapea a Candle VOs y guarda via CandleRepositoryPort



Responde con el numero de candles cargadas

RunBacktestUseCase





Recibe: { symbol, from, to, timeframe, modelType, warmupPeriod }



Crea BacktestSession con status CREATED



Carga candles del repo



Llama mlService.initialize(modelType)



Loop walk-forward:





Genera FeatureVector a partir de la candle actual (close, volume, returns, lags basicos)



mlService.partialTrain(features, target)



prediction = mlService.predict(features)



Calcula PredictionError contra candle[i+1].close



session.registerPrediction(predicted, actual, error)



Crea PredictionRecord



Al final: session.complete(), guarda sesion y predictions



Responde con BacktestSession completa (con metricas)

GetBacktestUseCase





Recibe: { sessionId }



Devuelve BacktestSession con metricas + opcionalmente predictions



Fase 3: ML Engine (Python)

Nuevo directorio raiz: ml-engine/ con:





ml-engine/app.py -- FastAPI app



ml-engine/requirements.txt -- fastapi, uvicorn, scikit-learn, numpy, pandas



ml-engine/Dockerfile

Endpoints

POST /initialize   { model_type: "sgd_regressor" }  -> { status: "ok" }
POST /partial-train { features: [...], target: 1.23 } -> { status: "ok" }
POST /predict       { features: [...] }               -> { prediction: 1.25 }
GET  /health                                           -> { status: "healthy" }

Modelo por sesion

Cada llamada a /initialize crea/resetea el modelo global. Un modelo por sesion (no persistido entre sesiones). Para el MVP esto basta; en el futuro se puede añadir session_id para paralelismo.

Docker

Añadir a docker-compose.yml:

ml-engine:
  build: ./ml-engine
  container_name: crypto_simulator_ml
  restart: unless-stopped
  ports:
    - "8000:8000"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 10s
    timeout: 5s
    retries: 5

Añadir a .env: ML_ENGINE_URL=http://localhost:8000

Añadir ml-engine al pnpm-workspace no (es Python, independiente).



Fase 4: Infraestructura Backend

Migracion nueva

Tabla historical_candles:





id UUID PK



symbol VARCHAR(20)



timeframe VARCHAR(5)



open_time TIMESTAMPTZ



open, high, low, close NUMERIC(20,8)



volume NUMERIC(30,8)



Index compuesto: (symbol, timeframe, open_time) UNIQUE

Tabla backtest_sessions:





id UUID PK



symbol VARCHAR(20)



timeframe VARCHAR(5)



start_date, end_date TIMESTAMPTZ



model_type VARCHAR(30)



status VARCHAR(20)



metrics JSONB (mae, mse, rmse, directionalAccuracy, totalPredictions)



created_at, completed_at TIMESTAMPTZ

Tabla predictions:





id UUID PK



session_id UUID FK -> backtest_sessions



timestamp TIMESTAMPTZ



predicted NUMERIC(20,8)



actual NUMERIC(20,8)



absolute_error NUMERIC(20,8)



direction_correct BOOLEAN



Index: (session_id, timestamp)

ORM entities + TypeORM repos

Implementaciones concretas de los 3 ports.

PythonMlAdapter

Clase PythonMlAdapter implements MlServicePort en infrastructure/adapters/python-ml.adapter.ts:





Usa axios para llamar a ML_ENGINE_URL (/initialize, /partial-train, /predict)



Inyecta ConfigService para la URL

Feature engineering (basico para MVP)

Funcion buildFeatures(candles, index) que retorna FeatureVector con:





close normalizado



volume normalizado



return_1 (retorno vs candle anterior)



return_5 (retorno vs 5 candles atras)



volatility_5 (std de ultimos 5 closes)

Esto vive en application layer como un servicio (no en dominio, no en Python).

HTTP Controller

ResearchController (/v1/research):





POST /candles/load -- llama LoadHistoricalDataUseCase



POST /backtest -- llama RunBacktestUseCase



GET /backtest/:id -- llama GetBacktestUseCase



GET /backtest -- lista sesiones

Registracion NestJS

Nuevo ResearchModule importado en AppModule, siguiendo el mismo patron que TradingModule:





TypeORM.forFeature con las 3 ORM entities



Providers: repos, adapters, use cases



El MarketDataPort de trading se reutiliza (importar TradingModule o re-proveer BinanceMarketAdapter)



Fase 5: Frontend (minimo)

Nueva seccion "Research" accesible desde el header:





Panel "Load Data": formulario con symbol, fecha inicio, fecha fin, timeframe. Boton "Load". Muestra num candles cargadas.



Panel "Run Backtest": formulario con symbol, fechas, timeframe, modelo, warmup. Boton "Run". Muestra progreso y resultado (metricas).



Panel "Results": lista de sesiones pasadas, click para ver metricas y grafico de predicted vs actual.



Archivos clave a crear/modificar

Crear







Archivo



Descripcion





ml-engine/app.py



FastAPI con /initialize, /partial-train, /predict





ml-engine/requirements.txt



Dependencias Python





ml-engine/Dockerfile



Imagen Python





backend/src/modules/research/



Todo el bounded context (domain, application, infrastructure)





backend/src/migrations/...ResearchSchema.ts



Tablas historical_candles, backtest_sessions, predictions

Modificar







Archivo



Cambio





docker-compose.yml



Añadir servicio ml-engine





.env.example



Añadir ML_ENGINE_URL





app.module.ts



Importar ResearchModule



Orden de implementacion

La implementacion sigue un orden bottom-up: primero dominio, luego infra, luego orquestacion.