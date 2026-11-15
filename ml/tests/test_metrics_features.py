import numpy as np
import pytest

from fieldshift_ml.evaluation import metrics as M
from fieldshift_ml.features.climate import run_length_at_least, spi


def test_regression_metrics_perfect_and_mean_prediction():
    y = np.array([1.0, 2.0, 3.0, 4.0])
    perfect = M.regression_metrics(y, y)
    assert perfect["r2"] == pytest.approx(1.0) and perfect["rmse"] == pytest.approx(0.0)
    mean = M.regression_metrics(y, np.full(4, y.mean()))
    assert mean["r2"] == pytest.approx(0.0)
    assert M.regression_metrics(y, y + 1)["bias"] == pytest.approx(1.0)


def test_binary_classification_metrics():
    y = np.array([0, 0, 1, 1])
    proba = np.array([[0.9, 0.1], [0.8, 0.2], [0.2, 0.8], [0.1, 0.9]])
    out = M.classification_metrics(y, proba.argmax(axis=1), proba, 2)
    assert out["roc_auc"] == pytest.approx(1.0) and out["accuracy"] == pytest.approx(1.0)
    assert out["brier"] == pytest.approx(np.mean([0.01, 0.04, 0.04, 0.01]))


def test_multiclass_metrics_survive_a_missing_class():
    y = np.array([0, 1, 1, 0])  # class 2 absent from the test fold
    proba = np.array([[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.2, 0.7, 0.1], [0.6, 0.3, 0.1]])
    out = M.classification_metrics(y, proba.argmax(axis=1), proba, 3)
    assert out["accuracy"] == pytest.approx(1.0) and "roc_auc" not in out


def test_mase_is_one_for_a_forecast_as_bad_as_the_seasonal_naive():
    y = np.array([10.0, 12.0, 14.0])
    out = M.forecast_metrics(y, y + 2.0, scale=np.full(3, 2.0))
    assert out["mase"] == pytest.approx(1.0) and out["mae"] == pytest.approx(2.0)


def test_primary_metric_depends_on_the_number_of_classes():
    assert M.primary_metric("classification", 2) == ("roc_auc", True)
    assert M.primary_metric("classification", 5) == ("f1_macro", True)
    assert M.primary_metric("forecast") == ("mase", False)


def test_run_length_marks_only_long_enough_runs():
    flags = np.array([1, 1, 0, 1, 1, 1, 0, 1], dtype=bool)
    assert run_length_at_least(flags, 3).tolist() == [False, False, False, True, True, True, False, False]
    assert run_length_at_least(np.ones(4, dtype=bool), 3).all()


def test_spi_is_standardized_and_uses_only_the_reference_period():
    rng = np.random.default_rng(0)
    months = np.tile(np.arange(1, 13), 60)
    rain = rng.gamma(2.0, 20.0, size=months.size)
    reference = np.arange(months.size) < 12 * 48
    index = spi(rain, months, reference)
    assert abs(np.nanmean(index[reference])) < 0.15 and 0.8 < np.nanstd(index[reference]) < 1.2
    changed = rain.copy()
    changed[~reference] *= 10  # altering the test years must not move the training-period index
    assert np.allclose(spi(changed, months, reference)[reference], index[reference])


def test_f1_weighted_counts_classes_by_support_and_f1_macro_does_not():
    y = np.array([0] * 90 + [1] * 10)
    pred = np.array([0] * 90 + [0] * 10)  # always predicts the big class
    out = M.classification_metrics(y, pred, None, 2)
    assert out["f1_macro"] < out["f1_weighted"]  # the missed minority class drags the macro average down
    assert out["f1_weighted"] == pytest.approx(0.9 * 2 * 0.9 / (0.9 + 1.0) + 0.0, abs=1e-6)


def test_per_class_report_has_precision_recall_f1_and_support():
    y = np.array([0, 0, 1, 1, 1, 2])
    pred = np.array([0, 1, 1, 1, 0, 2])
    report = M.per_class_report(y, pred, ["maiz", "trigo", "alfalfa", "ausente"])
    assert set(report) == {"maiz", "trigo", "alfalfa", "ausente"}
    assert report["trigo"]["support"] == 3 and report["trigo"]["precision"] == pytest.approx(2 / 3)
    assert report["trigo"]["recall"] == pytest.approx(2 / 3)
    assert report["maiz"]["f1"] == pytest.approx(0.5)
    assert report["ausente"]["support"] == 0 and report["ausente"]["f1"] == 0.0  # class absent from the test fold
