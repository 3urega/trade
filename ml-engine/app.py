import os
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.linear_model import SGDRegressor, PassiveAggressiveRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
import numpy as np
import joblib
import uuid
import logging
import math

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Use ML_MODELS_DIR env for local dev; Docker mounts mlmodels at /data/models
MODELS_DIR = Path(os.environ.get("ML_MODELS_DIR", "/data/models"))
FEATURE_NAMES = [
    "relative_range",
    "log_return_1",
    "log_return_5",
    "local_volatility",
    "norm_volume",
    "rsi_14",
    "ema_ratio_short",
    "ema_ratio_long",
    "macd_norm",
    "bb_position",
    "log_return_10",
    "log_return_20",
    "volume_ratio",
    "body_ratio",
]

# ---------------------------------------------------------------------------
# In-memory model state (one model per process, isolated per backtest session
# via /initialize reset)
# ---------------------------------------------------------------------------
model = None
scaler_x: StandardScaler | None = None
scaler_y: StandardScaler | None = None
model_type_active: str | None = None
train_count: int = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("ML Engine starting up — models dir: %s", MODELS_DIR)
    yield
    logger.info("ML Engine shutting down")


app = FastAPI(title="Eurega ML Engine", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class InitializeRequest(BaseModel):
    model_type: str = "sgd_regressor"


class PartialTrainRequest(BaseModel):
    features: list[float]
    target: float


class PredictRequest(BaseModel):
    features: list[float]


class StatusResponse(BaseModel):
    status: str
    model_type: str | None = None


class PredictionResponse(BaseModel):
    prediction: float


class DiagnosticsResponse(BaseModel):
    model_type: str | None
    train_count: int
    scaler_x_mean: list[float] | None
    scaler_x_var: list[float] | None
    scaler_y_mean: float | None
    scaler_y_var: float | None


class SaveModelResponse(BaseModel):
    model_id: str
    model_type: str
    train_count: int


class LoadModelRequest(BaseModel):
    model_id: str


class ModelInfo(BaseModel):
    model_id: str
    model_type: str
    train_count: int
    feature_names: list[str]
    saved_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SUPPORTED_MODELS = {
    "sgd_regressor": lambda: SGDRegressor(
        loss="squared_error",
        penalty="l2",
        alpha=0.0001,
        max_iter=1,
        tol=None,
        warm_start=True,
        random_state=42,
    ),
    "passive_aggressive": lambda: PassiveAggressiveRegressor(
        C=0.1,
        max_iter=1,
        tol=None,
        warm_start=True,
        random_state=42,
    ),
    "mlp_regressor": lambda: MLPRegressor(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        alpha=0.001,
        learning_rate="adaptive",
        learning_rate_init=0.001,
        max_iter=1,
        warm_start=True,
        random_state=42,
    ),
}


def _require_model():
    if model is None:
        raise HTTPException(
            status_code=400,
            detail="Model not initialized. Call POST /initialize first.",
        )


def _scaler_fitted(scaler: StandardScaler) -> bool:
    return hasattr(scaler, "mean_") and scaler.mean_ is not None


def _model_healthy() -> bool:
    """Verify model coefficients contain no NaN/Inf values."""
    if model is None:
        return False
    # Linear models (SGDRegressor, PassiveAggressive): coef_ is a 1-D array
    if hasattr(model, "coef_") and model.coef_ is not None:
        return bool(np.all(np.isfinite(model.coef_)))
    # MLP models: coefs_ is a list of weight matrices, one per layer
    if hasattr(model, "coefs_") and model.coefs_ is not None:
        return all(np.all(np.isfinite(c)) for c in model.coefs_)
    return False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=StatusResponse)
def health():
    return StatusResponse(status="healthy", model_type=model_type_active)


@app.get("/diagnostics", response_model=DiagnosticsResponse)
def diagnostics():
    x_mean = scaler_x.mean_.tolist() if scaler_x and _scaler_fitted(scaler_x) else None
    x_var = scaler_x.var_.tolist() if scaler_x and _scaler_fitted(scaler_x) else None
    y_mean = float(scaler_y.mean_[0]) if scaler_y and _scaler_fitted(scaler_y) else None
    y_var = float(scaler_y.var_[0]) if scaler_y and _scaler_fitted(scaler_y) else None
    return DiagnosticsResponse(
        model_type=model_type_active,
        train_count=train_count,
        scaler_x_mean=x_mean,
        scaler_x_var=x_var,
        scaler_y_mean=y_mean,
        scaler_y_var=y_var,
    )


@app.post("/initialize", response_model=StatusResponse)
def initialize(request: InitializeRequest):
    global model, scaler_x, scaler_y, model_type_active, train_count

    if request.model_type not in SUPPORTED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model_type '{request.model_type}'. Supported: {list(SUPPORTED_MODELS.keys())}",
        )

    model = SUPPORTED_MODELS[request.model_type]()
    scaler_x = StandardScaler()
    scaler_y = StandardScaler()
    model_type_active = request.model_type
    train_count = 0
    logger.info(f"Model initialized: {request.model_type}")
    return StatusResponse(status="initialized", model_type=model_type_active)


@app.post("/partial-train", response_model=StatusResponse)
def partial_train(request: PartialTrainRequest):
    global train_count
    _require_model()

    X = np.array(request.features).reshape(1, -1)
    y = np.array([[request.target]])

    scaler_x.partial_fit(X)
    scaler_y.partial_fit(y)

    if _scaler_fitted(scaler_x) and _scaler_fitted(scaler_y):
        X_scaled = scaler_x.transform(X)
        y_scaled = scaler_y.transform(y).ravel()
        model.partial_fit(X_scaled, y_scaled)

    train_count += 1
    return StatusResponse(status="trained", model_type=model_type_active)


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictRequest):
    _require_model()

    trained = (
        (hasattr(model, "coef_") and model.coef_ is not None) or
        (hasattr(model, "coefs_") and model.coefs_ is not None)
    )
    if not trained:
        raise HTTPException(
            status_code=400,
            detail="Model has not been trained yet. Call POST /partial-train at least once.",
        )

    if not (_scaler_fitted(scaler_x) and _scaler_fitted(scaler_y)):
        raise HTTPException(
            status_code=400,
            detail="Scalers not yet fitted. Call POST /partial-train at least once.",
        )

    X = np.array(request.features).reshape(1, -1)
    X_scaled = scaler_x.transform(X)
    pred_scaled = model.predict(X_scaled).reshape(1, -1)
    prediction = float(scaler_y.inverse_transform(pred_scaled)[0][0])

    if math.isnan(prediction) or math.isinf(prediction):
        raise HTTPException(status_code=500, detail="Model produced NaN/Inf — likely diverged.")

    return PredictionResponse(prediction=prediction)


# ---------------------------------------------------------------------------
# Model persistence
# ---------------------------------------------------------------------------

@app.post("/save-model", response_model=SaveModelResponse)
def save_model():
    _require_model()
    if not _model_healthy():
        raise HTTPException(status_code=400, detail="Model contains NaN/Inf — cannot save a corrupted snapshot.")

    model_id = str(uuid.uuid4())
    snapshot = {
        "model": model,
        "scaler_x": scaler_x,
        "scaler_y": scaler_y,
        "metadata": {
            "model_type": model_type_active,
            "train_count": train_count,
            "feature_names": FEATURE_NAMES,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        },
    }

    path = MODELS_DIR / f"{model_id}.joblib"
    joblib.dump(snapshot, path, compress=3)
    logger.info(f"Model saved: {model_id} ({model_type_active}, {train_count} steps)")

    return SaveModelResponse(model_id=model_id, model_type=model_type_active or "", train_count=train_count)


@app.post("/load-model", response_model=StatusResponse)
def load_model(request: LoadModelRequest):
    global model, scaler_x, scaler_y, model_type_active, train_count

    path = MODELS_DIR / f"{request.model_id}.joblib"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Model snapshot '{request.model_id}' not found.")

    snapshot = joblib.load(path)
    model = snapshot["model"]
    scaler_x = snapshot["scaler_x"]
    scaler_y = snapshot["scaler_y"]
    meta = snapshot.get("metadata", {})
    model_type_active = meta.get("model_type")
    train_count = meta.get("train_count", 0)

    if not _model_healthy():
        model = None
        raise HTTPException(status_code=400, detail="Loaded model contains NaN/Inf — snapshot is corrupted.")

    logger.info(f"Model loaded: {request.model_id} ({model_type_active}, {train_count} steps)")
    return StatusResponse(status="loaded", model_type=model_type_active)


@app.get("/models", response_model=list[ModelInfo])
def list_models():
    results: list[ModelInfo] = []
    for p in sorted(MODELS_DIR.glob("*.joblib")):
        try:
            snapshot = joblib.load(p)
            meta = snapshot.get("metadata", {})
            results.append(ModelInfo(
                model_id=p.stem,
                model_type=meta.get("model_type", "unknown"),
                train_count=meta.get("train_count", 0),
                feature_names=meta.get("feature_names", []),
                saved_at=meta.get("saved_at", ""),
            ))
        except Exception:
            logger.warning(f"Skipping corrupted snapshot: {p.name}")
    return results


@app.delete("/models/{model_id}", response_model=StatusResponse)
def delete_model(model_id: str):
    path = MODELS_DIR / f"{model_id}.joblib"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Model snapshot '{model_id}' not found.")
    path.unlink()
    logger.info(f"Model deleted: {model_id}")
    return StatusResponse(status="deleted")
