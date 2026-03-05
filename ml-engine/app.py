from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.linear_model import SGDRegressor, PassiveAggressiveRegressor
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory model state (one model per process, isolated per backtest session
# via /initialize reset)
# ---------------------------------------------------------------------------
model = None
model_type_active: str | None = None


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
        C=1.0,
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=StatusResponse)
def health():
    return StatusResponse(status="healthy", model_type=model_type_active)


@app.post("/initialize", response_model=StatusResponse)
def initialize(request: InitializeRequest):
    global model, model_type_active

    if request.model_type not in SUPPORTED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model_type '{request.model_type}'. Supported: {list(SUPPORTED_MODELS.keys())}",
        )

    model = SUPPORTED_MODELS[request.model_type]()
    model_type_active = request.model_type
    logger.info(f"Model initialized: {request.model_type}")
    return StatusResponse(status="initialized", model_type=model_type_active)


@app.post("/partial-train", response_model=StatusResponse)
def partial_train(request: PartialTrainRequest):
    _require_model()

    X = np.array(request.features).reshape(1, -1)
    y = np.array([request.target])

    model.partial_fit(X, y)

    return StatusResponse(status="trained", model_type=model_type_active)


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictRequest):
    _require_model()

    # SGDRegressor requires at least one partial_fit call before predict
    if not hasattr(model, "coef_") or model.coef_ is None:
        raise HTTPException(
            status_code=400,
            detail="Model has not been trained yet. Call POST /partial-train at least once.",
        )

    X = np.array(request.features).reshape(1, -1)
    prediction = float(model.predict(X)[0])

    return PredictionResponse(prediction=prediction)
