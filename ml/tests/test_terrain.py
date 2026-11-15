"""Elevation, slope and the erosion index: small synthetic cases with known answers."""

from __future__ import annotations

import math

import numpy as np
from rasterio.transform import Affine

from fieldshift_ml.datasets.erosion import erosion_index, slope_factor
from fieldshift_ml.io import dem


def _ramp(rise_per_cell: float) -> dem.Dem:
    """A plane that rises `rise_per_cell` metres toward the east, on a ~30 m grid at 40 N."""
    heights = np.tile(np.arange(20, dtype="float32") * rise_per_cell, (20, 1))
    return dem.Dem(heights=heights, transform=Affine(1 / 3600, 0, -104.0, 0, -1 / 3600, 40.0))


def test_flat_ground_has_zero_slope():
    assert np.nanmax(dem.slope_percent(_ramp(0.0))) == 0.0


def test_slope_matches_rise_over_run():
    plane = _ramp(3.0)  # 3 m of rise per cell
    cell_m = (1 / 3600) * 111_320 * math.cos(math.radians(39.997))
    expected = 3.0 / cell_m * 100
    assert abs(float(np.median(dem.slope_percent(plane))) - expected) < 0.2


def test_sample_reads_the_cell_under_a_point():
    plane = _ramp(2.0)
    lon = -104.0 + 5.5 / 3600  # inside column 5
    assert dem.sample(plane.heights, plane, np.array([lon]), np.array([39.999]))[0] == 10.0
    assert np.isnan(dem.sample(plane.heights, plane, np.array([-90.0]), np.array([39.999]))[0])


def test_steeper_land_erodes_more_and_the_two_fits_meet():
    assert (np.diff(slope_factor(np.array([0.5, 2, 5, 8.9, 10, 15, 25]))) > 0).all()
    low, high = slope_factor(np.array([8.99]))[0], slope_factor(np.array([9.0]))[0]
    assert abs(low - high) < 0.6  # no big jump between the gentle and steep equations


def test_index_rises_with_soil_erodibility_slope_and_rain():
    base = erosion_index(np.array([0.3, 0.3]), np.array([3.0, 3.0]), np.array([400.0, 400.0]))[0]
    assert erosion_index(np.array([0.4, 0.3]), np.array([3.0, 3.0]), np.array([400.0, 400.0]))[0] > base
    assert erosion_index(np.array([0.3, 0.3]), np.array([6.0, 3.0]), np.array([400.0, 400.0]))[0] > base
    assert erosion_index(np.array([0.3, 0.3]), np.array([3.0, 3.0]), np.array([600.0, 400.0]))[0] > base
