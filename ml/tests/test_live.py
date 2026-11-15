"""Live prediction pieces: POWER client, per-cell cache, zone checks, and the service (no network: fakes and a recorded response)."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest

from fieldshift_ml.io import power
from fieldshift_ml.io.live.cache import OVERLAP_DAYS, HistoryCache
from fieldshift_ml.io.live.power_api import PARAMETERS, PowerClient, PowerError, cell_of, parse_response
from fieldshift_ml.service import predictors


def _payload(days: list[date], t2m=None, extra: dict | None = None) -> dict:
    keys = [f"{d:%Y%m%d}" for d in days]
    t2m = t2m or [10.0 + i for i in range(len(days))]
    others = {name: dict.fromkeys(keys, 1.5) for name in PARAMETERS if name != "T2M"}
    return {"properties": {"parameter": {**others, "T2M": dict(zip(keys, t2m, strict=True)), **(extra or {})}}}


class FakeResponse:
    def __init__(self, status: int, payload: dict | None = None, text: str = ""):
        self.status_code, self._payload, self.text = status, payload, text

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def get(self, url, params=None, timeout=None):
        self.calls.append(params)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


# ------------------------------------------------------------------------------------------------------- parsing
def test_parse_turns_missing_values_into_nulls_and_drops_days_without_temperature():
    days = [date(2026, 1, d) for d in (1, 2, 3)]
    frame = parse_response(_payload(days, [5.0, -999.0, 7.0], {"GWETROOT": {"20260101": -999, "20260102": 0.3, "20260103": 0.4}}))
    assert frame["date"].to_list() == [days[0], days[2]]
    assert frame["GWETROOT"].to_list() == [None, 0.4]
    assert frame["PRECTOTCORR"].dtype == pl.Float64


def test_parse_refuses_a_response_without_data():
    with pytest.raises(PowerError):
        parse_response({"messages": ["error"]})
    with pytest.raises(PowerError):
        parse_response({"properties": {"parameter": {"PS": {"20260101": 1}}}})


def test_cells_follow_the_merra2_grid():
    assert cell_of(40.42, -104.71) == (40.5, -105.0)
    assert cell_of(40.30, -104.90) == cell_of(40.60, -105.10)  # same 0.5° × 0.625° cell


# -------------------------------------------------------------------------------------------------------- client
def test_client_retries_server_errors_and_then_succeeds(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    ok = FakeResponse(200, _payload([date(2026, 1, 1)]))
    session = FakeSession(FakeResponse(503), ok)
    frame = PowerClient(session=session, retries=3).daily(40.4, -104.7, date(2026, 1, 1), date(2026, 1, 1))
    assert frame.height == 1 and len(session.calls) == 2
    assert session.calls[0]["community"] == "AG" and session.calls[0]["start"] == "20260101"


def test_client_does_not_retry_a_client_error_and_reports_network_failures(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    session = FakeSession(FakeResponse(422, text="bad"))
    with pytest.raises(PowerError, match="422"):
        PowerClient(session=session, retries=3).daily(40.4, -104.7, date(2026, 1, 1), date(2026, 1, 2))
    assert len(session.calls) == 1
    down = FakeSession(ConnectionError("boom"), ConnectionError("boom"), ConnectionError("boom"))
    with pytest.raises(PowerError, match="3 intentos"):
        PowerClient(session=down, retries=3).daily(40.4, -104.7, date(2026, 1, 1), date(2026, 1, 2))


def test_client_validates_its_inputs():
    client = PowerClient(session=FakeSession())
    with pytest.raises(PowerError):
        client.daily(95, 0, date(2026, 1, 1), date(2026, 1, 2))
    with pytest.raises(PowerError):
        client.daily(40, -104, date(2026, 2, 1), date(2026, 1, 1))


# -------------------------------------------------------------------------------------------------------- cache
class CountingSource:
    def __init__(self, last_day: date):
        self.last_day, self.calls, self.fail = last_day, [], False

    def daily(self, lat, lon, start, end):
        self.calls.append((start, end))
        if self.fail:
            raise PowerError("sin red")
        days = [start + timedelta(days=i) for i in range((min(end, self.last_day) - start).days + 1)]
        return parse_response(_payload(days))


def test_cache_downloads_once_then_only_the_newest_days(tmp_path):
    clock = {"now": 1_000.0}
    today = {"day": date(2026, 6, 10)}
    source = CountingSource(date(2026, 6, 8))
    cache = HistoryCache(source, tmp_path, ttl_seconds=3600, clock=lambda: clock["now"], today=lambda: today["day"])
    frame, meta = cache.history(40.42, -104.71)
    assert source.calls == [(date(1981, 1, 1), date(2026, 6, 10))] and not meta.from_cache and meta.last_date == date(2026, 6, 8)
    _, meta = cache.history(40.45, -104.80)  # same cell, inside the TTL: no network call
    assert len(source.calls) == 1 and meta.from_cache
    clock["now"] += 7200
    today["day"], source.last_day = date(2026, 6, 12), date(2026, 6, 11)
    frame, meta = cache.history(40.42, -104.71)
    assert source.calls[1][0] == date(2026, 6, 8) - timedelta(days=OVERLAP_DAYS)  # only the tail is asked for
    assert meta.last_date == date(2026, 6, 11) and frame["date"].n_unique() == frame.height  # no duplicated days


def test_cache_serves_the_last_good_copy_when_the_source_fails(tmp_path):
    clock = {"now": 0.0}
    source = CountingSource(date(2026, 6, 8))
    cache = HistoryCache(source, tmp_path, ttl_seconds=10, clock=lambda: clock["now"], today=lambda: date(2026, 6, 10))
    cache.history(40.42, -104.71)
    clock["now"] = 100
    source.fail = True
    _, meta = cache.history(40.42, -104.71)
    assert meta.stale and meta.error == "sin red" and meta.last_date == date(2026, 6, 8)
    with pytest.raises(PowerError):  # a cell never downloaded and a dead source: there is nothing honest to return
        cache.history(40.9, -104.0)


def test_cache_survives_a_restart_through_the_disk_copy(tmp_path):
    source = CountingSource(date(2026, 6, 8))
    HistoryCache(source, tmp_path, ttl_seconds=10**9, today=lambda: date(2026, 6, 10)).history(40.42, -104.71)
    again = HistoryCache(source, tmp_path, ttl_seconds=10**9, today=lambda: date(2026, 6, 10))
    _, meta = again.history(40.42, -104.71)
    assert meta.from_cache and len(source.calls) == 1


# --------------------------------------------------------------------------------------------------------- zone
def test_only_weld_and_its_surroundings_are_predicted():
    assert predictors.in_zone(40.42, -104.71) and predictors.in_zone(40.95, -105.2)
    assert not predictors.in_zone(24.8, -107.4) and not predictors.in_zone(19.4, -99.1)  # Sinaloa, Mexico City
    site, distance = predictors.nearest_site(40.80, -104.75)
    assert site == "nunn-cper-temporal" and distance < 10


def test_the_frame_override_only_lasts_inside_the_block():
    frame = pl.DataFrame({"date": [date(2026, 1, 1)], "site": ["x"], "T2M": [1.0]})
    with power.use_daily_frame(frame):
        assert power.read_daily_all().height == 1
    assert power._OVERRIDE.get() is None


# ----------------------------------------------------------------------------------- recorded real response + models
RECORDED = Path("D:/FieldShift-Recursos/NASA/04-NASA-POWER/datos/power_daily_greeley-riego_19810101-20261112.json")
needs_data = pytest.mark.skipif(not RECORDED.exists(), reason="falta la respuesta grabada de NASA POWER en el disco de datos")


class ReplaySource:
    """Serves the real API response saved on the data disk, cut to the days asked for (and to `last_day`)."""

    def __init__(self, last_day: date | None = None):
        self.frame = parse_response(json.loads(RECORDED.read_text(encoding="utf-8")))
        self.last_day, self.calls = last_day, []

    def daily(self, lat, lon, start, end):
        self.calls.append((start, end))
        end = min(end, self.last_day) if self.last_day else end
        return self.frame.filter((pl.col("date") >= start) & (pl.col("date") <= end))


@needs_data
def test_the_recorded_response_parses_into_the_same_frame_as_the_csv():
    recorded = ReplaySource().frame
    csv = power.read_daily("greeley-riego")
    assert recorded.height == csv.height and recorded["date"].to_list() == csv["date"].to_list()
    for column in ("T2M", "T2M_MAX", "PRECTOTCORR", "GWETROOT", "EVPTRNS"):
        assert recorded[column].to_list() == csv[column].to_list()


@needs_data
def test_live_path_matches_the_batch_pipeline_on_the_same_weather():
    """The live predictor and the export path must agree: same builders, same models, same weather."""
    from fieldshift_ml.datasets.power_concepts import build_rain_probability
    from fieldshift_ml.deploy.predict import load_bundle, predict_tabular

    try:
        bundle = load_bundle("c08a")
    except Exception:  # noqa: BLE001
        pytest.skip("el modelo c08a no está entrenado en esta máquina")
    source = ReplaySource()
    cache = HistoryCache(source, None, today=lambda: date(2026, 11, 13))
    history, meta = cache.history(40.42, -104.71)
    live = predictors.predict_point(history, 40.42, -104.71, {"c08a": bundle}, {}, concepts=("c08a",))[0]
    batch = build_rain_probability(inference=True).frame
    batch = batch.filter(pl.col("site") == "greeley-riego").sort("date").tail(1)
    assert live.available and live.as_of == batch["date"][0] == meta.last_date
    assert live.value == pytest.approx(float(predict_tabular(bundle, batch)[0] * 100), abs=1e-6)


@needs_data
def test_heat_waves_are_not_predicted_out_of_season_and_are_in_summer():
    from fieldshift_ml.deploy.predict import load_bundle

    try:
        bundles = {"c05b": load_bundle("c05b")}
    except Exception:  # noqa: BLE001
        pytest.skip("el modelo c05b no está entrenado en esta máquina")
    winter = HistoryCache(ReplaySource(), None, today=lambda: date(2026, 11, 13)).history(40.42, -104.71)[0]
    result = predictors.predict_point(winter, 40.42, -104.71, bundles, {}, concepts=("c05b",))[0]
    assert not result.available and "mayo a septiembre" in (result.reason or "")
    summer = HistoryCache(ReplaySource(date(2026, 7, 15)), None, today=lambda: date(2026, 7, 16)).history(40.42, -104.71)[0]
    result = predictors.predict_point(summer, 40.42, -104.71, bundles, {}, concepts=("c05b",))[0]
    assert result.available and 0 <= result.value <= 100 and result.as_of == date(2026, 7, 15)
    hotter = predictors.predict_point(summer, 40.42, -104.71, bundles, {}, 0, 4, concepts=("c05b",))[0]
    assert hotter.scenario_applied and hotter.value > result.value  # +4 °C must raise the heat-wave probability


# ------------------------------------------------------------------------------------------------------ service
@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from fieldshift_ml.service.app import State, create_app

    source = CountingSource(date.today() - timedelta(days=2))
    state = State(source=source, token="secreto", env="development", load_models=False)
    with TestClient(create_app(state)) as test_client:
        test_client.app.state.ml = state
        test_client.state, test_client.source = state, source
        yield test_client


def test_service_requires_the_token_and_rejects_bad_input(client):
    body = {"lat": 40.42, "lon": -104.71}
    assert client.post("/predict", json=body).status_code == 401
    assert client.post("/predict", json=body, headers={"X-ML-Token": "otro"}).status_code == 401
    ok = {"X-ML-Token": "secreto"}
    assert client.post("/predict", json={"lat": 95, "lon": 0}, headers=ok).status_code == 422
    assert client.post("/predict", json={**body, "scenario": {"rain_pct": 500}}, headers=ok).status_code == 422
    assert client.post("/predict", json={**body, "extra": 1}, headers=ok).status_code == 422
    outside = client.post("/predict", json={"lat": 24.8, "lon": -107.4}, headers=ok)
    assert outside.status_code == 422 and "Fuera de la zona" in outside.json()["detail"]


def test_service_answers_with_data_age_and_says_which_models_are_missing(client):
    response = client.post("/predict", json={"lat": 40.42, "lon": -104.71}, headers={"X-ML-Token": "secreto"})
    assert response.status_code == 200
    body = response.json()
    assert body["site_used"] == "greeley-riego" and body["data"]["age_days"] == 2 and body["data"]["stale"] is False
    assert {r["concept"] for r in body["results"]} == set(predictors.LIVE_CONCEPTS)
    assert all(not r["available"] and "no está cargado" in r["reason"] for r in body["results"])  # nothing invented
    assert any("2 puntos de Weld" in w for w in body["warnings"])
    assert client.get("/health").json()["estado"] == "degradado"


def test_service_reports_a_dead_source_without_a_cached_copy(client):
    client.source.fail = True
    response = client.post("/predict", json={"lat": 40.9, "lon": -104.1}, headers={"X-ML-Token": "secreto"})
    assert response.status_code == 503 and "No hay datos frescos" in response.json()["detail"]


def test_production_refuses_to_start_without_a_token():
    from fieldshift_ml.service.app import State

    with pytest.raises(RuntimeError, match="ML_SERVICE_TOKEN"):
        State(source=CountingSource(date.today()), token="", env="production", load_models=False)


# ------------------------------------------------------------------------------------------------ global mode
def test_global_view_requests_only_visible_cells_and_caches_them():
    from fieldshift_ml.service.global_mode import MAX_CELLS, GlobalGrid, cells_in_view

    cells, sub = cells_in_view(-105.0, 40.0, -104.0, 41.0)
    assert 0 < len(cells) <= 9 and not sub
    world, sub = cells_in_view(-180, -80, 180, 80)
    assert len(world) <= MAX_CELLS and sub
    with pytest.raises(ValueError):
        cells_in_view(10, 5, 5, 6)
    source = CountingSource(date.today() - timedelta(days=2))
    grid = GlobalGrid(source, workers=1)
    first = grid.view(-105.0, 40.0, -104.0, 41.0)
    assert first["cells"] and first["missing"] == 0 and first["cells"][0]["soil_moisture_pct"] is not None
    calls = len(source.calls)
    grid.view(-105.0, 40.0, -104.0, 41.0)
    assert len(source.calls) == calls  # second look at the same place: no new API calls
    source.fail = True
    assert GlobalGrid(source).view(10.0, 10.0, 11.0, 11.0)["missing"] > 0  # a dead source leaves holes, never invented values
