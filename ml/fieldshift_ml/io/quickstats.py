"""USDA NASS QuickStats (crops file, 1.1 GB gzip).

DuckDB streams the gzip once and keeps only the regional states plus national rows in a Parquet cache;
loading the whole file in memory would not fit in 16 GB of RAM.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import polars as pl

from fieldshift_ml.config import REGION_STATES, get_settings

MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
          "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}


def _source() -> Path:
    folder = get_settings().external / "19-USDA-NASS-QuickStats" / "datos"
    files = sorted(p for p in folder.glob("qs.crops_*.txt.gz") if not p.name.endswith(".part"))
    if not files:
        raise FileNotFoundError(f"Falta qs.crops_*.txt.gz en {folder}")
    return files[-1]


def cache_file() -> Path:
    return get_settings().subdir("cache") / "quickstats_crops_region.parquet"


def ensure_cache() -> Path:
    """Extract the regional subset once (about four minutes)."""
    target = cache_file()
    if target.exists():
        return target
    states = ", ".join(f"'{s}'" for s in REGION_STATES)
    con = duckdb.connect()
    con.execute("SET memory_limit='6GB'")
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv('{_source().as_posix()}', delim='\t', header=true, all_varchar=true,
                                   quote='', ignore_errors=true)
            WHERE STATE_ALPHA IN ({states}) OR AGG_LEVEL_DESC = 'NATIONAL'
        ) TO '{target.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
    """)
    con.close()
    return target


def _scan() -> pl.LazyFrame:
    value = pl.col("VALUE").str.replace_all(",", "").str.strip_chars().cast(pl.Float64, strict=False)
    return pl.scan_parquet(ensure_cache()).with_columns(
        value.alias("value"), pl.col("YEAR").cast(pl.Int32).alias("year"),
    ).filter(pl.col("value").is_not_null())


def county_yields() -> pl.DataFrame:
    """Survey yields per county, year and crop series (all production practices)."""
    return (
        _scan().filter(
            (pl.col("STATISTICCAT_DESC") == "YIELD") & (pl.col("AGG_LEVEL_DESC") == "COUNTY")
            & (pl.col("SOURCE_DESC") == "SURVEY") & (pl.col("COUNTY_CODE") != "998")
            & (pl.col("PRODN_PRACTICE_DESC") == "ALL PRODUCTION PRACTICES")
        )
        .select(
            (pl.col("STATE_FIPS_CODE") + pl.col("COUNTY_CODE")).alias("fips"),
            pl.col("STATE_ALPHA").alias("state"), pl.col("COUNTY_NAME").alias("county"),
            pl.col("SHORT_DESC").alias("series"), pl.col("COMMODITY_DESC").alias("commodity"),
            pl.col("UNIT_DESC").alias("unit"), "year", pl.col("value").alias("yield"),
        )
        .unique(subset=["fips", "series", "year"]).collect()
    )


def monthly_prices(level: str = "NATIONAL") -> pl.DataFrame:
    """Monthly price received by farmers, one series per commodity."""
    frame = (
        _scan().filter(
            (pl.col("STATISTICCAT_DESC") == "PRICE RECEIVED") & (pl.col("FREQ_DESC") == "MONTHLY")
            & (pl.col("AGG_LEVEL_DESC") == level)
            & (pl.col("REFERENCE_PERIOD_DESC").is_in(list(MONTHS)))
        )
        .select(
            pl.col("SHORT_DESC").alias("series"), pl.col("COMMODITY_DESC").alias("commodity"),
            pl.col("UNIT_DESC").alias("unit"), pl.col("STATE_ALPHA").alias("state"), "year",
            pl.col("REFERENCE_PERIOD_DESC").replace_strict(MONTHS, return_dtype=pl.Int8).alias("month"),
            pl.col("value").alias("price"),
        )
        .collect()
    )
    return frame.with_columns(pl.date("year", "month", 1).alias("date")).unique(
        subset=["series", "state", "date"]).sort("series", "date")


def crop_progress(state: str = "CO") -> pl.DataFrame:
    """Weekly crop progress (% planted, % harvested, ...) at state level."""
    return (
        _scan().filter(
            (pl.col("STATISTICCAT_DESC") == "PROGRESS") & (pl.col("STATE_ALPHA") == state)
            & (pl.col("AGG_LEVEL_DESC") == "STATE") & (pl.col("WEEK_ENDING") != "")
        )
        .select(
            pl.col("COMMODITY_DESC").alias("commodity"), pl.col("SHORT_DESC").alias("series"),
            pl.col("UNIT_DESC").alias("stage"), "year",
            pl.col("WEEK_ENDING").str.to_date("%Y-%m-%d").alias("week_ending"),
            pl.col("value").alias("pct"),
        )
        .unique(subset=["series", "week_ending"]).sort("series", "week_ending").collect()
    )
