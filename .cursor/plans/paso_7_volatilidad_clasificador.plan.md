# PASO 7 — Modelo de volatilidad (clasificador)

## Concepto clave

Actualmente el sistema solo predice `log_return` (regresión: ¿cuánto subirá/bajará?). Esto es extremadamente difícil en crypto por el ruido. El modo VOLATILITY responde una pregunta más simple: **"¿habrá un movimiento grande?"** (clasificación binaria: 0 = no, 1 = sí). La dirección se infiere del momentum reciente (`sign(logReturn1)` = feature index 1).

### Flujo comparado

```
MODO RETURN (actual):
  features → predict(log_return) → si |return| > signalThreshold → trade en dirección del return

MODO VOLATILITY (nuevo):
  features → predict_proba(big_move?) → si probability > confidenceThreshold →
    direction = sign(logReturn1 del feature vector) → trade en esa dirección
```

### Truco de integración: pseudo log return

Para NO modificar `TradingSimulation.processTick()`, convertimos probability + direction en un pseudo log return:

```ts
const predictedLogReturn = direction * probability;
// Ejemplo: prob=0.75, dir=+1 → predictedLogReturn=+0.75 > threshold(0.6) → BUY
// Ejemplo: prob=0.75, dir=-1 → predictedLogReturn=-0.75 < -threshold(0.6) → SELL  
// Ejemplo: prob=0.40, dir=+1 → predictedLogReturn=+0.40 < threshold(0.6) → no trade
```

El `signalThreshold` en VOLATILITY mode funciona como `confidenceThreshold` (default 0.6 en vez de 0.0005).

---

## Cambios por archivo (13 archivos)

### 1. ML Engine — SGDClassifier + 2 endpoints nuevos

**Archivo**: `ml-engine/app.py`

#### 1a. Import

```python
from sklearn.linear_model import SGDRegressor, PassiveAggressiveRegressor, SGDClassifier
```

#### 1b. Añadir a SUPPORTED_MODELS

```python
"sgd_classifier": lambda: SGDClassifier(
    loss="log_loss",
    penalty="l2",
    alpha=0.0001,
    max_iter=1,
    tol=None,
    warm_start=True,
    random_state=42,
),
```

Nota: `loss="log_loss"` habilita `predict_proba()` en SGDClassifier.

#### 1c. Schema nuevo

```python
class ProbabilityResponse(BaseModel):
    probability: float
```

#### 1d. Endpoint `POST /partial-train-classifier`

Diferencias vs `/partial-train`:
- Solo escala X (no hay `scaler_y` — el target es 0/1 binario)
- Llama `model.partial_fit(X_scaled, [int(target)], classes=[0, 1])`
- El parámetro `classes` es requerido por scikit-learn para conocer las clases posibles

```python
@app.post("/partial-train-classifier", response_model=StatusResponse)
def partial_train_classifier(request: PartialTrainRequest):
    global train_count
    _require_model()

    X = np.array(request.features).reshape(1, -1)
    y_cls = int(request.target)

    scaler_x.partial_fit(X)

    if _scaler_fitted(scaler_x):
        X_scaled = scaler_x.transform(X)
        model.partial_fit(X_scaled, [y_cls], classes=[0, 1])

    train_count += 1
    return StatusResponse(status="trained", model_type=model_type_active)
```

#### 1e. Endpoint `POST /predict-proba`

```python
@app.post("/predict-proba", response_model=ProbabilityResponse)
def predict_proba(request: PredictRequest):
    _require_model()

    if not hasattr(model, "predict_proba"):
        raise HTTPException(status_code=400, detail="Model does not support predict_proba.")

    if not _model_is_trained(model):
        raise HTTPException(status_code=400, detail="Model not trained yet.")

    if not _scaler_fitted(scaler_x):
        raise HTTPException(status_code=400, detail="Scaler not fitted yet.")

    X = np.array(request.features).reshape(1, -1)
    X_scaled = scaler_x.transform(X)
    proba = model.predict_proba(X_scaled)  # [[prob_0, prob_1]]
    prob_big_move = float(proba[0][1])

    if math.isnan(prob_big_move) or math.isinf(prob_big_move):
        raise HTTPException(status_code=500, detail="Model produced NaN/Inf probability.")

    return ProbabilityResponse(probability=prob_big_move)
```

Nota: `/initialize` ya funciona con `sgd_classifier` sin cambios (lo busca en SUPPORTED_MODELS). `/save-model` y `/load-model` también funcionan — guardan `model` y `scaler_x`. El `scaler_y` se guarda pero se ignora.

Para `_check_model_healthy`, SGDClassifier tiene `coef_` así que funciona sin cambios.

---

### 2. Backend — Enums

**Archivo**: `backend/src/modules/research/domain/enums.ts`

Añadir nuevo enum `PredictionMode` y `SGD_CLASSIFIER` a `ModelType`:

```ts
export enum PredictionMode {
  RETURN = 'RETURN',
  VOLATILITY = 'VOLATILITY',
}
```

En ModelType, añadir:
```ts
SGD_CLASSIFIER = 'sgd_classifier',
```

---

### 3. Backend — MlServicePort

**Archivo**: `backend/src/modules/research/domain/ports/ml-service.port.ts`

Añadir 2 métodos:

```ts
partialTrainClassifier(x: FeatureVector, y: number): Promise<void>;
predictProba(x: FeatureVector): Promise<number>;
```

---

### 4. Backend — PythonMlAdapter

**Archivo**: `backend/src/modules/research/infrastructure/adapters/python-ml.adapter.ts`

Implementar los 2 métodos:

```ts
async partialTrainClassifier(x: FeatureVector, y: number): Promise<void> {
  await this.client.post('/partial-train-classifier', { features: x.features, target: y });
}

async predictProba(x: FeatureVector): Promise<number> {
  const res = await this.client.post<{ probability: number }>('/predict-proba', {
    features: x.features,
  });
  return res.data.probability;
}
```

---

### 5. Backend — RunBacktestDto

**Archivo**: `backend/src/modules/research/application/dtos/run-backtest.dto.ts`

Añadir 2 campos opcionales al final:

```ts
@ApiPropertyOptional({ enum: PredictionMode, example: 'RETURN', description: 'RETURN = predict log return, VOLATILITY = predict big move probability' })
@IsOptional()
@IsEnum(PredictionMode)
predictionMode?: PredictionMode;

@ApiPropertyOptional({ example: 0.005, description: 'Min price move to classify as big (VOLATILITY mode only, default 0.005 = 0.5%)' })
@IsOptional()
@IsNumber()
@Min(0)
volatilityThreshold?: number;
```

Imports necesarios: `IsOptional`, `IsNumber`, `Min`, `ApiPropertyOptional`, `IsEnum` (ya existen la mayoría), `PredictionMode`.

---

### 6. Backend — BacktestSession entity

**Archivo**: `backend/src/modules/research/domain/entities/backtest-session.entity.ts`

En `BacktestSessionProps`, añadir:
```ts
predictionMode?: string;
volatilityThreshold?: number;
```

Añadir getters:
```ts
get predictionMode(): string | undefined { return this.props.predictionMode; }
get volatilityThreshold(): number | undefined { return this.props.volatilityThreshold; }
```

Añadir setters:
```ts
setPredictionMode(mode: string): void { this.props.predictionMode = mode; }
setVolatilityThreshold(value: number): void { this.props.volatilityThreshold = value; }
```

---

### 7. Backend — ORM entity

**Archivo**: `backend/src/modules/research/infrastructure/persistence/backtest-session.orm-entity.ts`

Añadir 2 columnas:

```ts
@Column({ name: 'prediction_mode', type: 'varchar', length: 20, nullable: true })
predictionMode!: string | null;

@Column({ name: 'volatility_threshold', type: 'float', nullable: true })
volatilityThreshold!: number | null;
```

---

### 8. Backend — Repository mapper

**Archivo**: `backend/src/modules/research/infrastructure/persistence/backtest-typeorm.repository.ts`

En `toOrm()`, añadir:
```ts
orm.predictionMode = session.predictionMode ?? null;
orm.volatilityThreshold = session.volatilityThreshold ?? null;
```

En `toDomain()`, dentro del objeto props de `reconstitute`, añadir:
```ts
predictionMode: orm.predictionMode ?? undefined,
volatilityThreshold: orm.volatilityThreshold ?? undefined,
```

---

### 9. Backend — Response DTO

**Archivo**: `backend/src/modules/research/application/dtos/backtest-response.dto.ts`

En `BacktestSessionResponseDto`, añadir:
```ts
@ApiPropertyOptional() predictionMode?: string;
@ApiPropertyOptional() volatilityThreshold?: number;
```

En `fromDomain()`, añadir:
```ts
dto.predictionMode = session.predictionMode;
dto.volatilityThreshold = session.volatilityThreshold;
```

---

### 10. Backend — run-backtest.use-case.ts (cambios más importantes)

**Archivo**: `backend/src/modules/research/application/use-cases/run-backtest.use-case.ts`

Cambios:

1. **Import** `PredictionMode` del enums.

2. **Resolver parámetros** al inicio de `execute()`:
```ts
const predictionMode = dto.predictionMode ?? PredictionMode.RETURN;
const volatilityThreshold = dto.volatilityThreshold ?? 0.005;
const isVolatility = predictionMode === PredictionMode.VOLATILITY;
```

3. **Guardar en session** (después de crear y antes de save):
```ts
session.setPredictionMode(predictionMode);
if (isVolatility) session.setVolatilityThreshold(volatilityThreshold);
```

4. **Extender las lambdas** `mlPredict` y `mlTrain` para VOLATILITY:

La lógica actual es:
```ts
const isEnsemble = dto.modelType === ModelType.ENSEMBLE;
const mlPredict = ...
const mlTrain = ...
```

Debe convertirse en algo como:
```ts
const isEnsemble = dto.modelType === ModelType.ENSEMBLE;
const isVolatility = predictionMode === PredictionMode.VOLATILITY;

// Train: clasificador o regresor
const mlTrain = (x: FeatureVector, y: number) => {
  if (isVolatility) return this.mlService.partialTrainClassifier(x, y);
  if (isEnsemble) return this.mlService.partialTrainEnsemble(x, y);
  return this.mlService.partialTrain(x, y);
};

// Predict: para VOLATILITY no se puede combinar con ensemble (SGD classifier es single model)
const mlPredict = async (x: FeatureVector): Promise<number> => {
  if (isVolatility) return this.mlService.predictProba(x);
  if (isEnsemble) return this.mlService.predictEnsemble(x);
  return this.mlService.predict(x);
};
```

5. **Initialize**: Para VOLATILITY, siempre `initialize(SGD_CLASSIFIER)` (no ensemble):
```ts
if (isVolatility) {
  await this.mlService.initialize(ModelType.SGD_CLASSIFIER);
} else if (isEnsemble) {
  await this.mlService.initializeEnsemble();
} else {
  await this.mlService.initialize(dto.modelType);
}
```

6. **Target**: Cambiar cómo se calcula dentro del loop:
```ts
// Antes:
const logReturnTarget = Math.log(candles[i + 1].close / candles[i].close);

// Ahora:
let trainTarget: number;
const logReturnTarget = Math.log(candles[i + 1].close / candles[i].close);
if (isVolatility) {
  const move = Math.abs(candles[i + 1].close - candles[i].close) / candles[i].close;
  trainTarget = move > volatilityThreshold ? 1 : 0;
} else {
  trainTarget = logReturnTarget;
}
```

7. **Predicción**: Cuando VOLATILITY, convertir probabilidad a pseudo log return:
```ts
let rawPrediction: number;
rawPrediction = await mlPredict(featureVec);

let predictedLogReturn: number;
if (isVolatility) {
  const direction = Math.sign(featureVec.features[1]); // logReturn1
  predictedLogReturn = direction * rawPrediction;
} else {
  predictedLogReturn = rawPrediction;
}
```

8. **Train call**: Usar `trainTarget` en vez de `logReturnTarget`:
```ts
await mlTrain(featureVec, trainTarget);
```

9. **Save**: Para VOLATILITY (single model), usar `saveModel()`:
```ts
let snapshotId: string;
if (isEnsemble) {
  snapshotId = await this.mlService.saveEnsemble();
} else {
  snapshotId = await this.mlService.saveModel();
}
```

---

### 11. Backend — run-forward-test.use-case.ts

**Archivo**: `backend/src/modules/research/application/use-cases/run-forward-test.use-case.ts`

Cambios:

1. **Import** `PredictionMode`.

2. **Leer del source session**:
```ts
const predictionMode = sourceSession.predictionMode as PredictionMode | undefined;
const isVolatility = predictionMode === PredictionMode.VOLATILITY;
```

3. **Load model**: Para VOLATILITY usa loadModel (single model):
```ts
if (isEnsemble && !isVolatility) {
  await this.mlService.loadEnsemble(sourceSession.modelSnapshotId);
} else {
  await this.mlService.loadModel(sourceSession.modelSnapshotId);
}
```

4. **Default signalThreshold**: Cambiar según modo:
```ts
const signalThreshold = dto.signalThreshold ?? (isVolatility ? 0.6 : 0.0005);
```

5. **Predicción en el loop**: Convertir probabilidad a pseudo log return:
```ts
let rawPrediction: number;
if (isVolatility) {
  rawPrediction = await this.mlService.predictProba(featureVec);
} else if (isEnsemble) {
  rawPrediction = await this.mlService.predictEnsemble(featureVec);
} else {
  rawPrediction = await this.mlService.predict(featureVec);
}

let predictedLogReturn: number;
if (isVolatility) {
  const direction = Math.sign(featureVec.features[1]); // logReturn1
  predictedLogReturn = direction * rawPrediction;
} else {
  predictedLogReturn = rawPrediction;
}
```

---

### 12. Frontend — tipos

**Archivo**: `frontend/src/types/index.ts`

- Añadir `'sgd_classifier'` al union `ModelType`
- Añadir `export type PredictionMode = 'RETURN' | 'VOLATILITY';`
- En `BacktestSession`, añadir:
  ```ts
  predictionMode?: PredictionMode;
  volatilityThreshold?: number;
  ```

---

### 13. Frontend — formularios y API

#### `frontend/src/services/api.ts`

Añadir al payload de `runBacktest`:
```ts
predictionMode?: string;
volatilityThreshold?: number;
```

#### `frontend/src/components/research/RunBacktestForm.tsx`

- Importar `PredictionMode` del types
- Añadir `sgd_classifier` a la lista MODELS:
  ```ts
  { value: 'sgd_classifier', label: 'SGD Classifier (volatility)' },
  ```
- Añadir state:
  ```ts
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('RETURN');
  const [volatilityThreshold, setVolatilityThreshold] = useState(0.005);
  ```
- Añadir selector de PredictionMode (toggle/select entre RETURN y VOLATILITY)
- Cuando VOLATILITY: mostrar input de volatilityThreshold
- Cuando VOLATILITY: auto-seleccionar modelType='sgd_classifier' si no es ya un classifier
- Pasar `predictionMode` y `volatilityThreshold` en el payload

#### `frontend/src/components/research/ExperimentPanel.tsx`

- Añadir `sgd_classifier` a la lista MODELS

---

## Migración de base de datos

Las 2 nuevas columnas (`prediction_mode`, `volatility_threshold`) son nullable, así que TypeORM las añadirá automáticamente con `synchronize: true`. Si se usa migrations, generar una:

```sql
ALTER TABLE backtest_sessions ADD COLUMN prediction_mode VARCHAR(20);
ALTER TABLE backtest_sessions ADD COLUMN volatility_threshold FLOAT;
```

---

## Verificación

1. ✅ `POST /initialize` con `model_type: sgd_classifier` → inicializa correctamente
2. ✅ `POST /partial-train-classifier` → entrena con target binario
3. ✅ `POST /predict-proba` → devuelve probabilidad entre 0 y 1
4. ✅ Backtest con `predictionMode: VOLATILITY, modelType: sgd_classifier` → entrena clasificador, genera pseudo log returns, calcula métricas
5. ✅ Forward test sobre ese backtest → usa predictProba, tradea por probabilidad+dirección
6. ✅ Backtest con `predictionMode: RETURN` (default) → comportamiento idéntico al actual
7. ✅ Comparar `profitFactor`, `avgTrade`, `predictionCorrelation` entre modos
