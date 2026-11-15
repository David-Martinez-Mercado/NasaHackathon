"""Paths and constants. Every path comes from environment variables (see .env.example)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ML_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    resources_dir: Path = Path("F:/FieldShift-Recursos")
    ml_work_dir: Path = Path("artifacts")
    seed: int = 42
    test_fraction: float = 0.2

    model_config = SettingsConfigDict(env_file=ML_ROOT / ".env", extra="ignore")

    @property
    def nasa(self) -> Path:
        return self.resources_dir / "NASA"

    @property
    def external(self) -> Path:
        return self.resources_dir / "Externos"

    @property
    def work(self) -> Path:
        path = self.ml_work_dir if self.ml_work_dir.is_absolute() else ML_ROOT / self.ml_work_dir
        path.mkdir(parents=True, exist_ok=True)
        return path

    def subdir(self, name: str) -> Path:
        path = self.work / name
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


@dataclass(frozen=True)
class Site:
    key: str
    label: str
    lat: float
    lon: float
    irrigated: bool


# Reference points of the study zone (docs/decisiones.md, 2026-11-13)
SITES = {
    "greeley-riego": Site("greeley-riego", "Greeley (riego)", 40.42, -104.71, True),
    "nunn-cper-temporal": Site("nunn-cper-temporal", "Nunn / CPER (temporal)", 40.82, -104.75, False),
}

# Weld County, Colorado (FIPS 08123): lon_min, lat_min, lon_max, lat_max
WELD_BBOX = (-105.06, 39.91, -103.70, 41.00)
WELD_FIPS = "08123"
# States used to enlarge the yield table (Weld alone has ~25 rows per crop)
REGION_STATES = ("CO", "WY", "NE", "KS", "NM", "UT", "OK", "SD")
