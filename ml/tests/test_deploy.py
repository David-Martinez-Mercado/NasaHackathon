"""Deploy package: final training, artifacts, predictions, what-if scenarios, grids and the export contract.
Synthetic data only: none of these tests needs the project data."""

import json
from datetime import UTC, date, datetime

import numpy as np
import pandas as pd
import polars as pl
import pytest
from sklearn.metrics import roc_auc_score

from fieldshift_ml import config
from fieldshift_ml.config import ML_ROOT
from fieldshift_ml.datasets import registry as datasets
from fieldshift_ml.datasets.base import Concept, Dataset
from fieldshift_ml.datasets.vulnerability import RISK_DIRECTION
from fieldshift_ml.deploy import grid, paths
from fieldshift_ml.deploy.export import _layer, _roll_rotation_forward, _Run
from fieldshift_ml.deploy.manifest import evaluation_metrics, sha256_file
from fieldshift_ml.deploy.predict import (
    SCENARIO_COLUMNS,
    apply_scenario,
    index_scores,
    load_bundle,
    load_manifest,
    predict_forecast,
    predict_tabular,
)
from fieldshift_ml.deploy.registry import DEPLOY, DeploySpec, get_spec
from fieldshift_ml.deploy.schema import (
    SCHEMA_VERSION,
    ExportManifest,
    Layer,
    ScenarioGrid,
    Zone,
    json_schema,
)
from fieldshift_ml.deploy.train import train
from fieldshift_ml.deploy.validate import ExportInvalid, validate_export


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    monkeypatch.setenv("ML_DEPLOY_DIR", str(tmp_path / "deploy"))
    monkeypatch.setenv("ML_WORK_DIR", str(tmp_path / "work"))
    config.get_settings.cache_clear()
    yield tmp_path
    config.get_settings.cache_clear()


def _register(monkeypatch, concept: str, dataset: Dataset, spec: DeploySpec) -> None:
    original = datasets.get_concept
    fake = Concept(concept, 99, "prueba", "¿?", dataset.task, ("sintético",), lambda: dataset)
    monkeypatch.setattr(datasets, "get_concept", lambda c: fake if c == concept else original(c))
    monkeypatch.setitem(DEPLOY, concept, spec)


def _classification(n: int = 800, seed: int = 0) -> Dataset:
    rng = np.random.default_rng(seed)
    x1, x2 = rng.normal(size=n), rng.normal(size=n)
    frame = pl.DataFrame({
        "year": np.repeat(np.arange(2000, 2020), n // 20), "x1": x1, "x2": x2,
        "site": rng.choice(["a", "b"], n), "label": (x1 + 0.3 * x2 + rng.normal(scale=0.5, size=n) > 0).astype(int),
    })
    return Dataset("ctest", "classification", frame, target="label", features=["x1", "x2", "site"],
                   categorical=["site"], split="time", time_col="year")


SPEC_LOGISTIC = DeploySpec("ctest", "tabular", "modelo", "Regresión logística", "logistica", "prueba")


# ------------------------------------------------------------------------------------------ training
def test_final_training_uses_every_row_and_writes_the_artifacts(sandbox, monkeypatch):
    ds = _classification()
    _register(monkeypatch, "ctest", ds, SPEC_LOGISTIC)
    manifest = train("ctest", "t1")
    folder = paths.model_dir("ctest", "t1")
    assert {p.name for p in folder.iterdir()} == {"manifest.json", "model.joblib", "model_card.md"}
    assert (folder.parent / "LATEST").read_text(encoding="utf-8").strip() == "t1"
    assert manifest.trained_rows == ds.frame.height  # 100 % of the rows, no held-out test set
    assert manifest.classes == ["0", "1"] and manifest.trained_through == "2019"
    assert manifest.artifact.sha256 == sha256_file(folder / "model.joblib")
    assert manifest.data_sha256 and manifest.role == "modelo"
    assert "Weld" in manifest.limitations[0]
    card = (folder / "model_card.md").read_text(encoding="utf-8")
    assert "Regresión logística" in card and "100 %" in card

    bundle = load_bundle("ctest")
    p = predict_tabular(bundle, ds.frame)
    assert ((p >= 0) & (p <= 1)).all()
    assert roc_auc_score(ds.frame["label"], p) > 0.85
    assert load_manifest("ctest").version == "t1"


def test_regression_and_missing_columns(sandbox, monkeypatch):
    rng = np.random.default_rng(1)
    x = rng.normal(size=400)
    frame = pl.DataFrame({"year": np.repeat(np.arange(2000, 2020), 20), "x": x,
                          "y": 2 * x + rng.normal(scale=0.1, size=400)})
    ds = Dataset("ctest", "regression", frame, target="y", features=["x"], split="time", time_col="year")
    _register(monkeypatch, "ctest", ds, DeploySpec("ctest", "tabular", "modelo", "Lineal", "lineal", "prueba"))
    train("ctest", "t1")
    bundle = load_bundle("ctest")
    pred = predict_tabular(bundle, frame)
    assert np.corrcoef(pred, frame["y"])[0, 1] > 0.99
    with pytest.raises(ValueError, match="Faltan variables"):
        predict_tabular(bundle, frame.drop("x"))


def test_a_rule_is_deployed_as_a_rule(sandbox, monkeypatch):
    rng = np.random.default_rng(2)
    now = rng.integers(0, 2, 1000)
    nxt = np.where(rng.random(1000) > 0.9, 1 - now, now)  # the state persists 90 % of the time
    frame = pl.DataFrame({"year": np.repeat(np.arange(2000, 2020), 50), "state_now": now, "next": nxt})
    ds = Dataset("ctest", "classification", frame, target="next", features=["state_now"], split="time",
                 time_col="year", baseline_feature="state_now", baseline_name="base_persistencia")
    spec = DeploySpec("ctest", "tabular", "regla-base", "Persistencia", "base_persistencia", "prueba")
    _register(monkeypatch, "ctest", ds, spec)
    manifest = train("ctest", "t1")
    assert manifest.role == "regla-base" and manifest.name == "base_persistencia"
    p = predict_tabular(load_bundle("ctest"), frame)
    assert abs(p[now == 1].mean() - 0.9) < 0.05 and abs(p[now == 0].mean() - 0.1) < 0.05


def test_forecast_model_predicts_the_next_periods_of_each_series(sandbox, monkeypatch):
    months = pd.date_range("2000-01-01", periods=120, freq="MS")
    y = np.tile(np.arange(12, dtype=float), 10)
    frame = pl.DataFrame({"unique_id": "a", "ds": months, "y": y})
    ds = Dataset("ctest", "forecast", frame, target="y", freq="MS", horizon=6, season_length=12)
    spec = DeploySpec("ctest", "forecast", "regla-base", "Climatología", "base_climatologia", "prueba")
    _register(monkeypatch, "ctest", ds, spec)
    manifest = train("ctest", "t1")
    assert manifest.trained_rows == 120 and manifest.trained_through.startswith("2009-12")
    history = frame.select("unique_id", "ds", "y").to_pandas()
    forecast = predict_forecast(load_bundle("ctest"), history)
    assert len(forecast) == 6 and forecast["ds"].min() == pd.Timestamp("2010-01-01")
    assert forecast["yhat"].round(6).tolist() == [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]  # each month's own average


def test_vulnerability_index_orients_risk_factors(sandbox, monkeypatch):
    rng = np.random.default_rng(3)
    cols = list(RISK_DIRECTION)
    frame = pl.DataFrame({c: rng.normal(size=500) for c in cols}).with_columns(pl.lit(1).alias("block"))
    ds = Dataset("ctest", "unsupervised", frame, features=cols, split="none")
    _register(monkeypatch, "ctest", ds, DeploySpec("ctest", "index", "indice", "Índice", "indice_experto", "prueba"))
    train("ctest", "t1")
    bundle = load_bundle("ctest")
    base = index_scores(bundle, frame)
    assert base.min() >= 0 and base.max() <= 100
    steeper = frame.with_columns(pl.col("slope_pct") + 3)  # more slope = more vulnerable
    wetter = frame.with_columns(pl.col("available_water_cm") + 3)  # more available water = less vulnerable
    assert index_scores(bundle, steeper).mean() > base.mean() > index_scores(bundle, wetter).mean()


def test_registry_refuses_concepts_without_data():
    with pytest.raises(ValueError, match="NDVI"):
        get_spec("c09")
    with pytest.raises(KeyError):
        get_spec("c99")
    assert {"c01", "c02", "c03", "c04", "c05a", "c05b", "c06", "c07", "c08a", "c08b", "c10"} == set(DEPLOY)
    assert get_spec("c05a").role == "regla-base" and get_spec("c08b").role == "regla-base"


def test_evaluation_metrics_come_from_the_saved_results(sandbox):
    results = sandbox / "work" / "results"
    results.mkdir(parents=True)
    pl.DataFrame({
        "model": ["logistica", "base_persistencia", "base_frecuencia"], "is_baseline": [False, True, True],
        "error": ["", "", ""], "roc_auc": [0.87, 0.56, 0.5], "roc_auc_lo": [0.81, 0.53, 0.5],
        "roc_auc_hi": [0.92, 0.57, 0.5], "skill": [0.23, 0.0, -0.06],
    }).write_csv(results / "ctest.csv")
    (results / "ctest.json").write_text(json.dumps({"primary": "roc_auc", "split": "time", "run_at": "2026-11-15"}))
    m = evaluation_metrics("ctest", "logistica")
    assert (m.primary, m.value, m.ci_lo, m.ci_hi, m.skill) == ("roc_auc", 0.87, 0.81, 0.92, 0.23)
    assert m.baseline == "base_persistencia" and m.baseline_value == 0.56  # the strongest baseline, not the weakest
    assert evaluation_metrics("ctest", "no_existe") is None
    assert evaluation_metrics("otro", "logistica") is None


# ------------------------------------------------------------------------------------------ scenarios
def test_scenarios_move_only_the_declared_climate_columns():
    frame = pl.DataFrame({"T2M_MAX": [30.0], "T2M_MIN": [10.0], "T2M": [20.0], "tmax_minus_threshold": [-2.0],
                          "tmax_mean_3": [29.0], "tmax_mean_7": [28.0], "tmax_max_7": [31.0], "tmin_mean_7": [11.0],
                          "rain_sum_14": [10.0], "rain_sum_30": [20.0], "hot_days_7": [1], "RH2M": [40.0]})
    out = apply_scenario("c05b", frame, rain_pct=-50, temp_delta=2)
    assert out["T2M_MAX"][0] == 32.0 and out["tmax_minus_threshold"][0] == 0.0
    assert out["rain_sum_14"][0] == 5.0 and out["rain_sum_30"][0] == 10.0
    assert out["hot_days_7"][0] == 1 and out["RH2M"][0] == 40.0  # derived counts and unrelated inputs stay put
    assert apply_scenario("c05b", frame, 0, 0).equals(frame)


def test_scenarios_are_only_defined_where_they_make_sense():
    assert set(SCENARIO_COLUMNS) == {"c01", "c05b", "c08a"}
    with pytest.raises(ValueError, match="escenarios"):
        apply_scenario("c06", pl.DataFrame({"a": [1]}), 0, 0)
    with pytest.raises(ValueError, match="rain_pct"):
        apply_scenario("c05b", pl.DataFrame({"T2M": [1.0]}), 150, 0)


def test_more_heat_raises_the_modelled_probability(sandbox, monkeypatch):
    rng = np.random.default_rng(4)
    n = 1200
    tmax = rng.normal(28, 5, n)
    frame = pl.DataFrame({"year": np.repeat(np.arange(2000, 2020), n // 20), "T2M_MAX": tmax,
                          "rain_sum_30": rng.gamma(2, 10, n),
                          "label": (tmax + rng.normal(scale=2, size=n) > 33).astype(int)})
    ds = Dataset("ctest", "classification", frame, target="label", features=["T2M_MAX", "rain_sum_30"], split="time",
                 time_col="year")
    _register(monkeypatch, "ctest", ds, SPEC_LOGISTIC)
    train("ctest", "t1")
    bundle = load_bundle("ctest")
    base = predict_tabular(bundle, frame).mean()
    hotter = predict_tabular(bundle, apply_scenario("c05b", frame, 0, 2)).mean()
    cooler = predict_tabular(bundle, apply_scenario("c05b", frame, 0, -2)).mean()
    assert cooler < base < hotter


# ------------------------------------------------------------------------------------------ grids
def test_idw_reproduces_a_point_value_where_the_point_is():
    bbox = (0.0, 0.0, 10.0, 10.0)
    values = grid.idw([(2.5, 7.5, 100.0), (7.5, 2.5, 0.0)], bbox, cols=4, rows=4)
    assert len(values) == 16
    nw, se = values[0], values[15]  # row-major from the NORTH edge: index 0 = north-west cell
    assert nw > 90 and se < 10
    assert all(0 <= v <= 100 for v in values)


def test_aggregate_cells_averages_points_and_leaves_empty_cells_null():
    bbox = (0.0, 0.0, 4.0, 2.0)
    lons = np.array([0.5, 0.6, 3.5])
    lats = np.array([1.5, 1.4, 0.5])
    values = grid.aggregate_cells(lons, lats, np.array([10.0, 20.0, 40.0]), bbox, cols=4, rows=2)
    assert values[0] == 15.0 and values[7] == 40.0  # NW cell: mean of two points; SE cell: one point
    assert sum(v is None for v in values) == 6


def test_cell_centers_run_north_to_south():
    lon, lat = grid.cell_centers((0, 0, 4, 2), 4, 2)
    assert lat[0] > lat[-1] and lon[0] < lon[3] and lat[0] == lat[3]


def test_legend_goes_from_the_top_value_to_the_bottom_one():
    assert grid.legend(0, 100, "%") == ["100%", "75%", "50%", "25%", "0%"]


# ------------------------------------------------------------------------------------------ rotation
def test_rotation_rolls_one_year_forward():
    frame = pl.DataFrame({
        "year": [2023, 2023], "crop": ["maiz", "trigo_invierno"], "prev1": ["maiz", "maiz"],
        "prev2": ["trigo_invierno", "maiz"], "prev3": ["maiz", "maiz"], "prev4": ["barbecho", "maiz"],
        "prev5": ["alfalfa", "maiz"], "streak": pl.Series([1, 5], dtype=pl.Int16),
    })
    out = _roll_rotation_forward(frame)
    a, b = out.row(0, named=True), out.row(1, named=True)
    window = [a[f"prev{i}"] for i in (1, 2, 3, 4, 5)]
    assert a["year"] == 2024 and window == ["maiz", "maiz", "trigo_invierno", "maiz", "barbecho"]
    assert a["streak"] == 2 and a["distinct_crops"] == 3 and a["n_maiz"] == 3 and a["prev1_streak"] == "maiz|2"
    assert b["streak"] == 1 and b["prev1"] == "trigo_invierno" and b["n_maiz"] == 4 and b["distinct_crops"] == 2
    assert b["prev1_streak"] == "trigo_invierno|1"


# ------------------------------------------------------------------------------------------ export contract
def _layer_object(values=None, scenarios=None) -> Layer:
    size = 4
    return _layer("rain", "c08a", "Lluvia", "Prob.", "%", 0, 100,
                  scenarios or [ScenarioGrid(rain_pct=0, temp_delta=0, values=values or [1.0, 2.0, None, 4.0])],
                  False, "prueba", 1000, True, date(2026, 11, 10), [], bbox=(0, 0, 2, 2), cols=2, rows=size // 2)


def _write_export(folder, layer: Layer) -> None:
    run = _Run(folder)
    run.write("layers/rain.json", layer, "layer")
    manifest = ExportManifest(
        schema_version=SCHEMA_VERSION, version="v", generated_at=datetime.now(UTC),
        zone=Zone(name="Prueba", fips="08123", bbox=(0, 0, 2, 2)), data_as_of=date(2026, 11, 10), models=[],
        files=run.files, limitations=[])
    (folder / "manifest.json").write_text(manifest.model_dump_json(), encoding="utf-8")


def test_a_valid_export_passes(tmp_path):
    _write_export(tmp_path, _layer_object())
    assert validate_export(tmp_path).version == "v"


def test_a_modified_file_is_detected_by_its_hash(tmp_path):
    _write_export(tmp_path, _layer_object())
    target = tmp_path / "layers" / "rain.json"
    target.write_text(target.read_text(encoding="utf-8").replace("1000", "2000"), encoding="utf-8")
    with pytest.raises(ExportInvalid, match="hash"):
        validate_export(tmp_path)


def test_wrong_grid_size_and_missing_base_scenario_are_rejected(tmp_path):
    _write_export(tmp_path, _layer_object(values=[1.0, 2.0, 3.0]))
    with pytest.raises(ExportInvalid, match="valores"):
        validate_export(tmp_path)
    other = tmp_path / "otro"
    other.mkdir()
    only_wet = [ScenarioGrid(rain_pct=25, temp_delta=0, values=[1.0, 2.0, 3.0, 4.0])]
    _write_export(other, _layer_object(scenarios=only_wet))
    with pytest.raises(ExportInvalid, match="escenario base"):
        validate_export(other)


def test_a_file_missing_from_disk_is_reported(tmp_path):
    _write_export(tmp_path, _layer_object())
    (tmp_path / "layers" / "rain.json").unlink()
    with pytest.raises(ExportInvalid, match="no existe"):
        validate_export(tmp_path)


def test_schema_rejects_unknown_fields_and_out_of_range_scenarios():
    with pytest.raises(ValueError):
        ScenarioGrid(rain_pct=500, temp_delta=0, values=[1.0])
    with pytest.raises(ValueError):
        ScenarioGrid.model_validate({"rain_pct": 0, "temp_delta": 0, "values": [1.0], "extra": 1})


def test_the_committed_json_schema_matches_the_models():
    """`fieldshift-ml deploy schema` must be re-run whenever deploy/schema.py changes."""
    committed = json.loads((ML_ROOT / "deploy" / "export.schema.json").read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(json_schema()))
    assert committed["schema_version"] == SCHEMA_VERSION
    files = {"file_manifest", "file_layer", "file_points", "file_series", "file_summaries", "file_tables"}
    assert files <= set(committed["$defs"])
