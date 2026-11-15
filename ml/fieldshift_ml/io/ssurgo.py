"""SSURGO (Web Soil Survey) for Weld: map-unit polygons plus the aggregated attribute table."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

from fieldshift_ml.config import get_settings

# muaggatt.txt has no header; these are its 40 columns in order (SSURGO 2.x metadata)
MUAGGATT_COLUMNS = [
    "musym", "muname", "mustatus", "slopegraddcp", "slopegradwta", "brockdepmin", "wtdepannmin",
    "wtdepaprjunmin", "flodfreqdcd", "flodfreqmax", "pondfreqprs", "aws025wta", "aws050wta", "aws0100wta",
    "aws0150wta", "drclassdcd", "drclasswettest", "hydgrpdcd", "iccdcd", "iccdcdpct", "niccdcd",
    "niccdcdpct", "engdwobdcd", "engdwbdcd", "engdwbll", "engdwbml", "engstafdcd", "engstafll",
    "engstafml", "engsldcd", "engsldcp", "englrsdcd", "engcmssdcd", "engcmssmp", "urbrecptdcd",
    "urbrecptwta", "forpehrtdcp", "hydclprs", "awmmfpwwta", "mukey",
]
DRAINAGE = {"Excessively drained": 1, "Somewhat excessively drained": 2, "Well drained": 3,
            "Moderately well drained": 4, "Somewhat poorly drained": 5, "Poorly drained": 6,
            "Very poorly drained": 7}
FLOODING = {"None": 0, "Very rare": 1, "Rare": 2, "Occasional": 3, "Frequent": 4, "Very frequent": 5}
HYDRO_GROUP = {"A": 1, "B": 2, "C": 3, "D": 4}


def _archives() -> list[Path]:
    folder = get_settings().external / "10-SSURGO-WebSoilSurvey" / "datos"
    files = sorted(folder.glob("wss_SSA_*.zip"))
    if not files:
        raise FileNotFoundError(f"No hay archivos SSURGO (wss_SSA_*.zip) en {folder}")
    return files


def read_map_units() -> gpd.GeoDataFrame:
    """Polygons with soil attributes: slope (%), available water 0–100 cm, drainage, capability class."""
    parts = []
    for path in _archives():
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            shape = next(n for n in names if "/spatial/soilmu_a_" in n and n.endswith(".shp"))
            table = next(n for n in names if n.endswith("tabular/muaggatt.txt"))
            attributes = pd.read_csv(io.BytesIO(archive.read(table)), sep="|", header=None,
                                     names=MUAGGATT_COLUMNS, dtype=str, encoding="latin-1")
        polygons = gpd.read_file(f"zip://{path.as_posix()}!{shape}")
        polygons["mukey"] = polygons["MUKEY"].astype(str)
        parts.append(polygons[["mukey", "geometry"]].merge(attributes, on="mukey", how="left"))
    units = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=parts[0].crs)
    for column in ("slopegradwta", "aws0100wta", "wtdepannmin", "niccdcd"):
        units[column] = pd.to_numeric(units[column], errors="coerce")
    units["drainage"] = units["drclassdcd"].map(DRAINAGE)
    units["flooding"] = units["flodfreqdcd"].map(FLOODING)
    units["hydro_group"] = units["hydgrpdcd"].astype(str).str[-1].map(HYDRO_GROUP)  # "A/D" counts as D
    return units.rename(columns={"slopegradwta": "slope_pct", "aws0100wta": "available_water_cm",
                                 "wtdepannmin": "water_table_cm", "niccdcd": "capability_class"})[
        ["mukey", "muname", "slope_pct", "available_water_cm", "water_table_cm", "capability_class",
         "drainage", "flooding", "hydro_group", "geometry"]]
