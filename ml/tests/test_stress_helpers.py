"""c03 helpers: out-of-sample pixel history and local time with daylight saving."""

from datetime import date, datetime

import polars as pl
import pytest

from fieldshift_ml.datasets.stress import add_esi_history, to_local_time

CUTOFF = date(2025, 1, 1)


def _frame(rows: list[tuple[str, date, float]]) -> pl.DataFrame:
    return pl.DataFrame({"pixel": [r[0] for r in rows], "date": [r[1] for r in rows], "esi": [r[2] for r in rows]})


def _hist(frame: pl.DataFrame) -> dict[tuple[str, date], float]:
    out = add_esi_history(frame, CUTOFF)
    return {(r["pixel"], r["date"]): r["esi_hist"] for r in out.iter_rows(named=True)}


def test_a_training_row_never_sees_its_own_label():
    base = _frame([("A", date(2024, 1, 1), 0.2), ("A", date(2024, 2, 1), 0.4), ("A", date(2024, 3, 1), 0.6)])
    first = _hist(base)
    assert first[("A", date(2024, 1, 1))] == pytest.approx(0.5)  # mean of the other two (0.4, 0.6)
    assert first[("A", date(2024, 3, 1))] == pytest.approx(0.3)
    # changing a row's own label must not change its own history
    own = pl.col("date") == date(2024, 1, 1)
    changed = base.with_columns(pl.when(own).then(0.99).otherwise(pl.col("esi")).alias("esi"))
    assert _hist(changed)[("A", date(2024, 1, 1))] == pytest.approx(first[("A", date(2024, 1, 1))])


def test_pixel_with_a_single_date_falls_back_to_the_global_training_mean():
    frame = _frame([("A", date(2024, 1, 1), 0.2), ("A", date(2024, 2, 1), 0.4), ("B", date(2024, 1, 1), 0.9)])
    overall = (0.2 + 0.4 + 0.9) / 3
    assert _hist(frame)[("B", date(2024, 1, 1))] == pytest.approx(overall)


def test_test_rows_use_all_training_dates_and_never_their_own_label():
    frame = _frame([
        ("A", date(2024, 1, 1), 0.2), ("A", date(2024, 2, 1), 0.4), ("A", date(2025, 3, 1), 0.9),
        ("C", date(2025, 3, 1), 0.1),  # a pixel that only appears in the test period
    ])
    hist = _hist(frame)
    assert hist[("A", date(2025, 3, 1))] == pytest.approx(0.3)  # mean of A's two training dates
    assert hist[("C", date(2025, 3, 1))] == pytest.approx(0.3)  # global training mean (0.2 + 0.4) / 2
    in_test = pl.col("date") == date(2025, 3, 1)
    changed = frame.with_columns(pl.when(in_test).then(0.0).otherwise(pl.col("esi")).alias("esi"))
    assert _hist(changed)[("A", date(2025, 3, 1))] == pytest.approx(0.3)  # test labels never enter the history


def test_local_time_follows_daylight_saving():
    frame = pl.DataFrame({"time_utc": [
        datetime(2025, 7, 15, 18, 0), datetime(2025, 1, 15, 18, 0), datetime(2025, 7, 15, 3, 0),
    ]})
    out = to_local_time(frame)
    local = out["time_local"]
    assert [local.dt.hour()[i] for i in range(3)] == [12, 11, 21]  # UTC-6 in July, UTC-7 in January
    assert out["time_local"].dt.date()[2] == date(2025, 7, 14)  # 03:00 UTC is still the previous local day


def test_local_time_accepts_an_already_zoned_column():
    frame = pl.DataFrame({"time_utc": [datetime(2025, 7, 15, 18, 0)]}).with_columns(
        pl.col("time_utc").dt.replace_time_zone("UTC"))
    assert to_local_time(frame)["time_local"].dt.hour()[0] == 12
