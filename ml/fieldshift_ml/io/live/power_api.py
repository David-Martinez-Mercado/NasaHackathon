"""NASA POWER daily API (point): fresh weather for any coordinates, no key needed.

The response is turned into the SAME frame `io.power.read_daily` produces from the downloaded CSV (a `date` column plus
one column per variable, -999 as null), so the dataset builders and the deployed models run on it unchanged.
"""

from __future__ import annotations

import logging
import math
import time
from datetime import date, timedelta
from typing import Protocol

import polars as pl

log = logging.getLogger("fieldshift_ml")

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
# The 20 variables of the downloaded files (community AG). The builders use a subset; a single request returned all of
# them for 1981–2026 in about 2 s of server time (recorded in the response header).
PARAMETERS = (
    "T2M", "T2M_MAX", "T2M_MIN", "T2M_RANGE", "T2MDEW", "TS", "PRECTOTCORR", "RH2M", "QV2M", "WS2M", "PS",
    "ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "ALLSKY_SFC_PAR_TOT", "GWETTOP", "GWETROOT", "GWETPROF", "EVPTRNS",
    "T2MWET", "ALLSKY_SFC_LW_DWN",
)
FIRST_DAY = date(1981, 1, 1)
MISSING = -999.0
# MERRA-2 grid: 0.5° of latitude by 0.625° of longitude. Points inside one cell get the same weather.
LAT_STEP, LON_STEP = 0.5, 0.625


class PowerError(RuntimeError):
    """The POWER API could not give usable data (network, HTTP error, or an unexpected response)."""


class PowerSource(Protocol):
    def daily(self, lat: float, lon: float, start: date, end: date) -> pl.DataFrame: ...


def cell_of(lat: float, lon: float) -> tuple[float, float]:
    """Centre of the MERRA-2 cell that contains the point (used as the cache key)."""
    return round(lat / LAT_STEP) * LAT_STEP, round((lon + 180) / LON_STEP) * LON_STEP - 180


def parse_response(payload: dict) -> pl.DataFrame:
    """POWER JSON -> frame with `date` and one float column per variable; -999 becomes null; days with no T2M are dropped."""
    try:
        parameters = payload["properties"]["parameter"]
    except (KeyError, TypeError) as exc:
        raise PowerError("Respuesta de POWER sin 'properties.parameter'") from exc
    if not parameters or "T2M" not in parameters:
        raise PowerError("La respuesta de POWER no trae T2M")
    days = sorted(parameters["T2M"])
    columns = {
        name: [None if (v := values.get(day)) is None or v == MISSING else float(v) for day in days]
        for name, values in parameters.items()
    }
    frame = pl.DataFrame({"date": [date(int(d[:4]), int(d[4:6]), int(d[6:8])) for d in days], **columns})
    return frame.filter(pl.col("T2M").is_not_null()).sort("date")


class PowerClient:
    """Synchronous client with a timeout, retries with back-off and clear errors. Never invents data."""

    def __init__(self, base_url: str = POWER_URL, timeout: float = 60.0, retries: int = 3, backoff: float = 1.5,
                 session=None):
        self.base_url, self.timeout, self.retries, self.backoff = base_url, timeout, retries, backoff
        if session is None:
            import requests

            session = requests.Session()
        self.session = session

    def daily(self, lat: float, lon: float, start: date, end: date) -> pl.DataFrame:
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or math.isnan(lat) or math.isnan(lon):
            raise PowerError("Coordenadas fuera de rango")
        if end < start:
            raise PowerError("La fecha final es anterior a la inicial")
        params = {
            "parameters": ",".join(PARAMETERS), "community": "AG", "longitude": f"{lon:.4f}", "latitude": f"{lat:.4f}",
            "start": f"{start:%Y%m%d}", "end": f"{end:%Y%m%d}", "format": "JSON",
        }
        last_error = ""
        for attempt in range(1, self.retries + 1):
            try:
                response = self.session.get(self.base_url, params=params, timeout=self.timeout)
                if response.status_code in (429, 500, 502, 503, 504):
                    raise PowerError(f"POWER respondió {response.status_code}")
                if response.status_code != 200:
                    raise PowerError(f"POWER respondió {response.status_code}: {response.text[:160]}")
                return parse_response(response.json())
            except PowerError as exc:
                last_error = str(exc)
                if "respondió 4" in last_error and "429" not in last_error:
                    raise  # a client error will not get better by retrying
            except Exception as exc:  # noqa: BLE001 - network errors, timeouts, bad JSON
                last_error = f"{type(exc).__name__}: {exc}"[:200]
            if attempt < self.retries:
                time.sleep(self.backoff**attempt)
        raise PowerError(f"No se pudo consultar NASA POWER tras {self.retries} intentos: {last_error}")


def latest_day(frame: pl.DataFrame) -> date:
    return frame["date"].max()


def days_since(day: date, today: date | None = None) -> int:
    return ((today or date.today()) - day).days


__all__ = ["PARAMETERS", "PowerClient", "PowerError", "PowerSource", "cell_of", "parse_response", "timedelta"]
