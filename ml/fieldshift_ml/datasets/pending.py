"""Concepts that cannot be built yet. They explain which source is missing instead of failing silently."""

from __future__ import annotations

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import DataNotReady, Dataset


def _ndvi_missing() -> list[str]:
    settings = get_settings()
    missing = []
    if not (settings.nasa / "03-MODIS-VIIRS" / "datos").exists():
        missing.append("NDVI MODIS/VIIRS 2000–2026 (pedido AppEEARS aún sin descargar)")
    missing.append("Serie Landsat/HLS completa (hoy solo hay escenas 2024–2026 y la descarga sigue)")
    return missing


def build_degradation() -> Dataset:
    """c09 — needs a long productivity series (NDVI) to relate it to years of the same crop."""
    raise DataNotReady("c09", _ndvi_missing())


def build_health() -> Dataset:
    """c11 — needs a long greenness series per parcel to measure trend and anomalies."""
    raise DataNotReady("c11", _ndvi_missing())
