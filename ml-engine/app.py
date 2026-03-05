from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.linear_model import SGDRegressor, PassiveAggressiveRegressor
from sklearn.preprocessing import StandardScaler
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    logger.info("ML Engine starting up")
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
        C=0.1,  # Reduced from 1.0 to limit step size and prevent divergence
        max_iter=1,
        tol=None,
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=StatusResponse)
def health():
    return StatusResponse(status="healthy", model_type=model_type_active)


@app.get("/diagnostics", response_model=DiagnosticsResponse)
def diagnostics():
    """Debug endpoint: returns current scaler statistics and training count."""
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
    y = np.array([[request.target]])  # shape (1, 1) for scaler_y

    # Update scalers incrementally
    scaler_x.partial_fit(X)
    scaler_y.partial_fit(y)

    # Only transform once both scalers have seen at least one sample
    if _scaler_fitted(scaler_x) and _scaler_fitted(scaler_y):
        X_scaled = scaler_x.transform(X)
        y_scaled = scaler_y.transform(y).ravel()
        model.partial_fit(X_scaled, y_scaled)

    train_count += 1
    return StatusResponse(status="trained", model_type=model_type_active)


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictRequest):
    _require_model()

    if not hasattr(model, "coef_") or model.coef_ is None:
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
    # inverse_transform back to original target scale
    prediction = float(scaler_y.inverse_transform(pred_scaled)[0][0])

    return PredictionResponse(prediction=prediction)
