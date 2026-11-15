"""What is on disk for each source (file counts only; nothing is opened)."""

from __future__ import annotations

import polars as pl

from fieldshift_ml.config import get_settings

# (source, group, relative folder, glob, concepts that use it)
SOURCES = [
    ("NASA POWER diario", "NASA", "04-NASA-POWER/datos", "power_daily_*.csv", "c03 c04 c05b c08a c08b"),
    ("SMAP humedad de suelo", "NASA", "01-SMAP/datos", "*", "c04 (sustituye a GWETROOT)"),
    ("GPM IMERG lluvia", "NASA", "02-GPM-IMERG/datos", "*", "c08"),
    ("MODIS/VIIRS NDVI", "NASA", "03-MODIS-VIIRS/datos", "*", "c09 c11"),
    ("Landsat C2 L2", "NASA", "03-Landsat-HLS/datos/Landsat_C2_L2/escenas", "**/*.TIF", "c09 c11"),
    ("SRTM elevación", "NASA", "05-SRTM/datos", "*", "c06 (pendiente)"),
    ("ECOSTRESS ESI", "NASA", "06-ECOSTRESS/datos/L4T_ESI_v003_estres_2024-2026", "*_ESI.tif", "c03"),
    ("NLDAS/GLDAS", "NASA", "07-NLDAS-GLDAS/datos", "*", "c04"),
    ("SSURGO suelos", "Externos", "10-SSURGO-WebSoilSurvey/datos", "wss_SSA_*.zip", "c06 c03"),
    ("CDL CropScape Weld", "Externos", "11-CDL-CropScape/datos", "CDL_*_Weld_*.tif", "c02 c06"),
    ("PRISM mensual 4 km", "Externos", "12-PRISM/datos/mensual_4km_1981-2026", "*.zip", "c01 c07"),
    ("PRISM normales 800 m", "Externos", "12-PRISM/datos/normales_1991-2020_800m", "*.zip", "c06"),
    ("NASS QuickStats", "Externos", "19-USDA-NASS-QuickStats/datos", "qs.*.txt.gz", "c01 c07 c10"),
    ("ERA5 mensual", "Externos", "23-ERA5/datos", "mensual_*.nc", "c05a"),
    ("ERA5 horario", "Externos", "23-ERA5/datos/horario", "*.nc", "—"),
    ("Límites de condado (Censo)", "Externos", "24-Census-Condados/datos", "*.zip", "c01 c07"),
    ("OpenET", "Externos", "20-OpenET/datos", "*.tif", "c04"),
    ("USDA AMS precios", "Externos", "18-USDA-AMS-MarketNews/datos", "*.csv", "c10"),
]


def inventory() -> pl.DataFrame:
    settings = get_settings()
    rows = []
    for name, group, folder, pattern, concepts in SOURCES:
        path = (settings.nasa if group == "NASA" else settings.external) / folder
        files = [p for p in path.glob(pattern) if p.is_file() and not p.name.startswith("_")] if path.exists() else []
        partial = sum(1 for p in files if p.name.endswith(".part"))
        rows.append({
            "fuente": name, "grupo": group, "archivos": len(files) - partial, "a_medias": partial,
            "estado": "listo" if len(files) - partial > 0 else "sin datos", "conceptos": concepts,
        })
    return pl.DataFrame(rows)
