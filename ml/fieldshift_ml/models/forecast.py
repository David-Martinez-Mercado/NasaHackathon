"""Forecasting models behind one interface: fit(train) once, then predict(history, h).

`history` is everything known up to the forecast origin, so the evaluator can roll the origin through
the test period without refitting. Frames are pandas (unique_id, ds, y): Prophet and the Nixtla
libraries are most reliable with pandas, so this is the only place it is used on purpose.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

ID, DS, Y, YHAT = "unique_id", "ds", "y", "yhat"


def _future_dates(history: pd.DataFrame, h: int, freq: str) -> pd.DataFrame:
    """Next `h` timestamps after the end of each series."""
    last = history.groupby(ID, sort=False)[DS].max()
    parts = []
    for uid, end in last.items():
        dates = pd.date_range(end, periods=h + 1, freq=freq)[1:]
        parts.append(pd.DataFrame({ID: uid, DS: dates}))
    return pd.concat(parts, ignore_index=True)


def _expose_stan_tbb() -> None:
    """Put Prophet's bundled TBB library on PATH (Windows).

    cmdstanpy looks for tbb.dll with `where.exe`; when it is not found, the localized error message
    cannot be decoded under UTF-8 mode and Prophet fails to start.
    """
    import importlib.util
    import os
    from pathlib import Path

    spec = importlib.util.find_spec("prophet")
    if spec is None or spec.origin is None:
        return
    for tbb in Path(spec.origin).parent.glob("stan_model/cmdstan-*/stan/lib/stan_math/lib/tbb"):
        if str(tbb) not in os.environ.get("PATH", ""):
            os.environ["PATH"] = str(tbb) + os.pathsep + os.environ.get("PATH", "")


@dataclass
class Forecaster:
    name: str
    family: str
    freq: str
    season_length: int
    baseline: bool = False
    slow: bool = False

    def fit(self, train: pd.DataFrame) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:  # pragma: no cover - interface
        raise NotImplementedError


class NaiveLast(Forecaster):
    """Persistence: tomorrow equals today."""

    def fit(self, train: pd.DataFrame) -> None:
        return None

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        future = _future_dates(history, h, self.freq)
        last = history.sort_values(DS).groupby(ID, sort=False)[Y].last()
        future[YHAT] = future[ID].map(last).to_numpy()
        return future


class SeasonalNaive(Forecaster):
    """Same value as one season ago (last year's month, etc.)."""

    def fit(self, train: pd.DataFrame) -> None:
        return None

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        future = _future_dates(history, h, self.freq)
        values = []
        for uid, group in history.sort_values(DS).groupby(ID, sort=False):
            tail = group[Y].to_numpy()[-self.season_length:]
            if tail.size < self.season_length:  # series shorter than one season: fall back to persistence
                tail = np.repeat(tail[-1:], self.season_length)
            reps = int(np.ceil(h / self.season_length))
            values.append(pd.Series(np.tile(tail, reps)[:h], index=future.index[future[ID] == uid]))
        future[YHAT] = pd.concat(values).sort_index().to_numpy()
        return future


class Climatology(Forecaster):
    """Long-term mean of each position in the season (e.g. the average of every July), from training only."""

    def _position(self, dates: pd.Series) -> pd.Series:
        if self.season_length == 12:
            return dates.dt.month
        if self.season_length in (52, 53):
            return dates.dt.isocalendar().week.astype(int).clip(upper=52)
        if self.season_length in (365, 366):
            return dates.dt.dayofyear.clip(upper=365)
        return pd.Series(0, index=dates.index)

    def fit(self, train: pd.DataFrame) -> None:
        frame = train.assign(_pos=self._position(train[DS]))
        self._means = frame.groupby([ID, "_pos"])[Y].mean()
        self._overall = frame.groupby(ID)[Y].mean()

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        future = _future_dates(history, h, self.freq)
        keys = list(zip(future[ID], self._position(future[DS]), strict=True))
        values = self._means.reindex(keys).to_numpy()
        fallback = future[ID].map(self._overall).to_numpy()
        future[YHAT] = np.where(np.isnan(values), fallback, values)
        return future


class StatsForecastModel(Forecaster):
    """AutoARIMA, AutoETS, AutoTheta... fitted once per series; `forward` reapplies the fitted model
    (same parameters) to the history known at each forecast origin."""

    def __init__(self, name: str, model_name: str, freq: str, season_length: int, slow: bool = False):
        super().__init__(name, "estadistico", freq, season_length, slow=slow)
        self.model_name = model_name

    def fit(self, train: pd.DataFrame) -> None:
        from statsforecast import models as sfm

        cls = getattr(sfm, self.model_name)
        self._models = {}
        for uid, group in train.sort_values(DS).groupby(ID, sort=False):
            self._models[uid] = cls(season_length=self.season_length).fit(group[Y].to_numpy(dtype=float))

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        future = _future_dates(history, h, self.freq)
        values = {}
        for uid, group in history.sort_values(DS).groupby(ID, sort=False):
            values[uid] = self._models[uid].forward(y=group[Y].to_numpy(dtype=float), h=h)["mean"]
        future[YHAT] = np.concatenate([values[uid] for uid in future[ID].drop_duplicates()])
        return future


class ProphetModel(Forecaster):
    """Prophet: trend + yearly seasonality per series. It does not use recent history when predicting."""

    def fit(self, train: pd.DataFrame) -> None:
        _expose_stan_tbb()
        from prophet import Prophet

        logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
        logging.getLogger("prophet").setLevel(logging.WARNING)
        self._models = {}
        for uid, group in train.groupby(ID, sort=False):
            model = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
            model.fit(group[[DS, Y]])
            self._models[uid] = model

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        future = _future_dates(history, h, self.freq)
        parts = []
        for uid, group in future.groupby(ID, sort=False):
            forecast = self._models[uid].predict(group[[DS]])
            parts.append(pd.DataFrame({ID: uid, DS: group[DS].to_numpy(), YHAT: forecast["yhat"].to_numpy()}))
        return pd.concat(parts, ignore_index=True)


def lag_exog(frame: pd.DataFrame, cols: list[str], lag: int, freq: str) -> pd.DataFrame:
    """Return (id, ds, `<col>_lag<lag>`...) where the value on date d is the column's value on d - lag periods.

    The shift is by DATE, not by row, so a missing period gives NaN instead of silently pulling a wrong row.
    The result has a row for every date up to `last date + lag periods`, which is exactly what is needed to
    describe the next `lag` periods using only what is already known.
    """
    offset = pd.tseries.frequencies.to_offset(freq) * lag
    shifted = frame[[ID, DS, *cols]].copy()
    shifted[DS] = shifted[DS] + offset
    return shifted.rename(columns={c: f"{c}_lag{lag}" for c in cols})


class LagBoosting(Forecaster):
    """Gradient boosting on lagged values (one global model for all series), forecast recursively.

    With `exog` (names of weather columns of the same period) it also sees those columns shifted by `exog_lag`
    periods. The rule against leakage: the weather of a future period is unknown at the forecast origin, so the
    value used to predict period t+k is the one from t+k-`exog_lag`, which is already known as long as
    `exog_lag` >= k. Hence `exog_lag` must be at least the forecast horizon, and `predict` refuses a longer one.
    """

    def __init__(self, name: str, engine: str, freq: str, season_length: int, seed: int = 42,
                 exog: list[str] | None = None, exog_lag: int | None = None):
        super().__init__(name, "boosting", freq, season_length)
        self.engine = engine
        self.seed = seed
        self.exog = list(exog or [])
        self.exog_lag = exog_lag
        if self.exog and not exog_lag:
            raise ValueError("Las variables exógenas necesitan exog_lag (>= horizonte) para no usar el futuro")

    def _with_exog(self, frame: pd.DataFrame) -> pd.DataFrame:
        """(id, ds, y) plus the lagged weather columns, built only from `frame` itself."""
        base = frame[[ID, DS, Y]]
        if not self.exog:
            return base
        lagged = lag_exog(frame, self.exog, self.exog_lag, self.freq)
        return base.merge(lagged, on=[ID, DS], how="left")

    def _estimator(self):
        if self.engine == "xgboost":
            from xgboost import XGBRegressor

            return XGBRegressor(n_estimators=400, learning_rate=0.05, max_depth=5, subsample=0.8,
                                random_state=self.seed, n_jobs=-1)
        from lightgbm import LGBMRegressor

        return LGBMRegressor(n_estimators=400, learning_rate=0.05, num_leaves=15, subsample=0.8,
                             subsample_freq=1, random_state=self.seed, verbose=-1, n_jobs=-1)

    def fit(self, train: pd.DataFrame) -> None:
        from mlforecast import MLForecast
        from mlforecast.lag_transforms import RollingMean, RollingStd

        season = self.season_length
        short = max(2, min(4, season // 3 or 2))
        lags = sorted({1, 2, 3, short, season, 2 * season} - {0})
        lags = [lag for lag in lags if lag < len(train) // max(1, train[ID].nunique()) // 3]
        self._fcst = MLForecast(
            models={self.name: self._estimator()},
            freq=self.freq,
            lags=lags,
            lag_transforms={1: [RollingMean(window_size=short), RollingStd(window_size=max(short, 3)),
                                RollingMean(window_size=min(season, 12))]},
            date_features=["month"],
        )
        self._fcst.fit(self._with_exog(train), static_features=[])

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        if not self.exog:
            out = self._fcst.predict(h, new_df=history[[ID, DS, Y]])
            return out.rename(columns={self.name: YHAT})[[ID, DS, YHAT]]
        if h > self.exog_lag:
            raise ValueError(
                f"{self.name}: con exog_lag={self.exog_lag} no se pueden pronosticar {h} periodos "
                "(se usaría clima del futuro)"
            )
        lagged = lag_exog(history, self.exog, self.exog_lag, self.freq)
        future = _future_dates(history, h, self.freq).merge(lagged, on=[ID, DS], how="left")
        out = self._fcst.predict(h, new_df=self._with_exog(history), X_df=future)
        return out.rename(columns={self.name: YHAT})[[ID, DS, YHAT]]


class NeuralModel(Forecaster):
    """LSTM, GRU, PatchTST, N-BEATS via neuralforecast (PyTorch; uses the GPU when present)."""

    def __init__(self, name: str, model_name: str, freq: str, season_length: int, horizon: int,
                 fast: bool = False, seed: int = 42):
        super().__init__(name, "red_neuronal", freq, season_length, slow=True)
        self.model_name = model_name
        self.horizon = horizon
        self.fast = fast
        self.seed = seed

    def fit(self, train: pd.DataFrame) -> None:
        from neuralforecast import NeuralForecast
        from neuralforecast import models as nfm

        logging.getLogger("pytorch_lightning").setLevel(logging.ERROR)
        logging.getLogger("lightning.pytorch").setLevel(logging.ERROR)
        shortest = int(train.groupby(ID)[Y].size().min())
        input_size = int(min(max(2 * self.season_length, 4 * self.horizon), shortest // 4))
        common = dict(
            h=self.horizon, input_size=input_size, max_steps=150 if self.fast else 800,
            scaler_type="standard", random_seed=self.seed, val_check_steps=50,
            early_stop_patience_steps=5, enable_progress_bar=False, logger=False,
            enable_checkpointing=False, enable_model_summary=False,
        )
        model = getattr(nfm, self.model_name)(alias=self.name, **common)
        self._nf = NeuralForecast(models=[model], freq=self.freq)
        self._nf.fit(df=train[[ID, DS, Y]], val_size=max(self.horizon, shortest // 10))

    def predict(self, history: pd.DataFrame, h: int) -> pd.DataFrame:
        out = self._nf.predict(df=history[[ID, DS, Y]])
        out = out.reset_index() if ID not in out.columns else out
        out = out.rename(columns={self.name: YHAT})[[ID, DS, YHAT]]
        return out.groupby(ID, sort=False).head(h).reset_index(drop=True)


def forecast_models(freq: str, season_length: int, horizon: int, fast: bool = False,
                    seed: int = 42, exog: list[str] | None = None) -> list[Forecaster]:
    """All candidates for one forecasting concept. The first baseline is the reference for `skill`."""
    models: list[Forecaster] = [
        SeasonalNaive("base_estacional", "base", freq, season_length, baseline=True),
        NaiveLast("base_persistencia", "base", freq, season_length, baseline=True),
        Climatology("base_climatologia", "base", freq, season_length, baseline=True),
        StatsForecastModel("auto_arima", "AutoARIMA", freq, season_length, slow=season_length > 24),
        StatsForecastModel("auto_ets", "AutoETS", freq, season_length),
        StatsForecastModel("auto_theta", "AutoTheta", freq, season_length),
        ProphetModel("prophet", "estadistico", freq, season_length),
        LagBoosting("lightgbm_rezagos", "lightgbm", freq, season_length, seed),
        LagBoosting("xgboost_rezagos", "xgboost", freq, season_length, seed),
    ]
    if exog:  # added next to the plain versions so that the gain from weather can be measured
        models += [
            LagBoosting("lightgbm_exogenas", "lightgbm", freq, season_length, seed, exog, horizon),
            LagBoosting("xgboost_exogenas", "xgboost", freq, season_length, seed, exog, horizon),
        ]
    for name, cls in (("lstm", "LSTM"), ("gru", "GRU"), ("nbeats", "NBEATS"), ("patchtst", "PatchTST")):
        models.append(NeuralModel(name, cls, freq, season_length, horizon, fast, seed))
    return models
