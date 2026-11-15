"""Live prediction service (FastAPI). Internal: only the backend calls it, with a shared token.

    fieldshift-ml serve            # http://127.0.0.1:8001
    POST /predict   {"lat": 40.42, "lon": -104.71, "scenario": {"rain_pct": -20, "temp_delta": 2}}
    GET  /health    GET /fuentes

Configuration is by environment variables (nothing is hard-coded): ML_SERVICE_TOKEN, ML_SERVICE_ENV (development |
production), ML_SERVICE_MAX_CONCURRENCY, ML_SERVICE_CACHE_TTL_HOURS, ML_SERVICE_POWER_URL.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from fieldshift_ml.config import get_settings
from fieldshift_ml.deploy.predict import load_bundle, load_manifest
from fieldshift_ml.io.live.cache import HistoryCache
from fieldshift_ml.io.live.power_api import POWER_URL, PowerClient, PowerError, PowerSource, days_since
from fieldshift_ml.service import predictors
from fieldshift_ml.service.global_mode import GlobalGrid

log = logging.getLogger("fieldshift_ml")


# ---------------------------------------------------------------------------------------------------------- schemas
class ScenarioIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rain_pct: float = Field(0, ge=-50, le=50, description="Cambio de lluvia en % (los sliders de la app)")
    temp_delta: float = Field(0, ge=-2, le=4, description="Cambio de temperatura en °C")


class ViewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)


class PredictIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    scenario: ScenarioIn | None = None


class ConceptOut(BaseModel):
    concept: str
    title: str
    unit: str
    horizon: str
    available: bool
    value: float | None = None
    series: list[float] | None = None
    as_of: date | None = None
    source: str = "vivo"
    role: str = "modelo"
    algorithm: str = ""
    scenario_applied: bool = False
    notes: list[str] = []
    reason: str | None = None


class DataOut(BaseModel):
    last_date: date
    age_days: int
    fetched_at: datetime
    from_cache: bool
    stale: bool
    cell_lat: float
    cell_lon: float
    observations: dict


class PredictOut(BaseModel):
    lat: float
    lon: float
    site_used: str
    site_distance_km: float
    generated_at: datetime
    latency_ms: float
    data: DataOut
    results: list[ConceptOut]
    warnings: list[str]


# ----------------------------------------------------------------------------------------------------------- state
class State:
    """Loaded models, the weather cache and the limits. Built once at startup (or injected in tests)."""

    def __init__(self, source: PowerSource | None = None, token: str | None = None, env: str | None = None,
                 max_concurrency: int | None = None, ttl_hours: float | None = None, load_models: bool = True,
                 cache_dir: Path | None = None):
        self.env = (env or os.environ.get("ML_SERVICE_ENV", "development")).lower()
        self.token = token if token is not None else os.environ.get("ML_SERVICE_TOKEN", "")
        if self.env == "production" and not self.token:
            raise RuntimeError("En producción ML_SERVICE_TOKEN es obligatorio: el servicio no arranca sin él.")
        ttl = ttl_hours if ttl_hours is not None else float(os.environ.get("ML_SERVICE_CACHE_TTL_HOURS", "6"))
        injected = source is not None
        source = source or PowerClient(os.environ.get("ML_SERVICE_POWER_URL", POWER_URL))
        self.source = source
        # An injected source (tests) never touches the real cache folder: fake data must not be served later as if it were real.
        folder = cache_dir if cache_dir is not None else (None if injected else get_settings().subdir("live_cache"))
        self.cache = HistoryCache(source, folder, ttl_seconds=ttl * 3600)
        self.limit = asyncio.Semaphore(max_concurrency or int(os.environ.get("ML_SERVICE_MAX_CONCURRENCY", "4")))
        self.grid = GlobalGrid(source)
        self.bundles: dict[str, dict] = {}
        self.info: dict[str, dict] = {}
        self.load_errors: dict[str, str] = {}
        self.started_at = time.time()
        if load_models:
            self.load()

    def load(self) -> None:
        for concept in predictors.LIVE_CONCEPTS:
            try:
                self.bundles[concept] = load_bundle(concept)
                manifest = load_manifest(concept)
                self.info[concept] = {"role": manifest.role, "algorithm": manifest.algorithm, "version": manifest.version}
            except Exception as exc:  # noqa: BLE001 - a missing model must not stop the others
                self.load_errors[concept] = f"{type(exc).__name__}: {exc}"[:200]
                log.warning("No se cargó el modelo %s: %s", concept, self.load_errors[concept])


def create_app(state: State | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.ml = state or State()
        log.info("Servicio listo: modelos %s, entorno %s", sorted(app.state.ml.bundles), app.state.ml.env)
        yield

    app = FastAPI(title="Field Shift · predicciones en vivo", version="0.1.0", lifespan=lifespan,
                  docs_url=None if os.environ.get("ML_SERVICE_ENV", "development") == "production" else "/docs", redoc_url=None)

    def ml(request: Request) -> State:
        return request.app.state.ml

    def auth(request: Request, x_ml_token: str | None = Header(default=None)) -> None:
        expected = ml(request).token
        if expected and not hmac.compare_digest(x_ml_token or "", expected):
            raise HTTPException(status_code=401, detail="Token inválido")

    @app.get("/health")
    def health(request: Request) -> dict:
        s = ml(request)
        ok = bool(s.bundles)
        return {"estado": "ok" if ok else "degradado", "modelos": sorted(s.bundles), "modelos_con_error": s.load_errors,
                "entorno": s.env, "activo_desde": datetime.fromtimestamp(s.started_at, UTC).isoformat()}

    @app.get("/fuentes", dependencies=[Depends(auth)])
    def sources(request: Request) -> dict:
        s = ml(request)
        return {
            "nasa_power": {"url": getattr(s.source, "base_url", "inyectada"), "llave": "no necesita",
                           "retraso_tipico_dias": 2, "ttl_cache_horas": s.cache.ttl / 3600},
            "en_vivo": list(predictors.LIVE_CONCEPTS),
            "por_lotes": {"c05a": "ERA5 (cola de minutos a horas)", "c03": "ECOSTRESS (escenas)", "c01": "NASS + PRISM (anual)",
                          "c07": "NASS (anual)", "c10": "NASS precios (necesita llave)", "c02": "CDL (anual)", "c06": "estático"},
        }

    @app.post("/global", dependencies=[Depends(auth)])
    async def global_view(body: ViewIn, request: Request) -> dict:
        if not (body.west < body.east and body.south < body.north):
            raise HTTPException(status_code=422, detail="Caja del mapa no válida")
        async with ml(request).limit:
            return await asyncio.to_thread(ml(request).grid.view, body.west, body.south, body.east, body.north)

    @app.post("/predict", response_model=PredictOut, dependencies=[Depends(auth)])
    async def predict(body: PredictIn, request: Request) -> PredictOut:
        s = ml(request)
        started = time.perf_counter()
        if not predictors.in_zone(body.lat, body.lon):
            raise HTTPException(status_code=422, detail="Fuera de la zona de entrenamiento (condado de Weld, Colorado y sus alrededores): no se predice.")
        scenario = body.scenario or ScenarioIn()
        async with s.limit:
            try:
                history, meta = await asyncio.to_thread(s.cache.history, body.lat, body.lon)
            except PowerError as exc:
                raise HTTPException(status_code=503, detail=f"No hay datos frescos y no hay copia guardada: {exc}") from exc
            results = await asyncio.to_thread(predictors.predict_point, history, body.lat, body.lon, s.bundles, s.info,
                                              scenario.rain_pct, scenario.temp_delta)
        site, distance = predictors.nearest_site(body.lat, body.lon)
        warnings = [f"Los modelos se entrenaron con 2 puntos de Weld; se usa «{site}» como referencia ({distance:.0f} km). "
                    "Para otras coordenadas es una extrapolación suave."]
        if meta.stale:
            warnings.append(f"NASA POWER no respondió: se usan datos guardados al {meta.last_date}. {meta.error or ''}".strip())
        if days_since(meta.last_date) > 7:
            warnings.append(f"El dato más reciente tiene {days_since(meta.last_date)} días: la fuente está atrasada.")
        for concept, error in s.load_errors.items():
            warnings.append(f"Modelo {concept} no disponible: {error}")
        return PredictOut(
            lat=body.lat, lon=body.lon, site_used=site, site_distance_km=round(distance, 1), generated_at=datetime.now(UTC),
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
            data=DataOut(last_date=meta.last_date, age_days=days_since(meta.last_date),
                         fetched_at=datetime.fromtimestamp(meta.fetched_at, UTC), from_cache=meta.from_cache, stale=meta.stale,
                         cell_lat=meta.cell[0], cell_lon=meta.cell[1], observations=predictors.observations(history)),
            results=[ConceptOut(**vars(r)) for r in results], warnings=warnings)

    return app
