import math
from typing import Dict, Iterable, List

from .models import FusedCell, RasterCell, SensorReading


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def _normalize(value: float, lower: float, upper: float) -> float:
    if upper <= lower:
        return 0.0
    clipped = min(max(value, lower), upper)
    return (clipped - lower) / (upper - lower)


def interpolate_sensor_features(
    cell: RasterCell,
    sensors: Iterable[SensorReading],
    radius: float = 0.4,
    power: float = 2.0,
) -> Dict[str, float]:
    weighted_totals: Dict[str, float] = {}
    total_weights: Dict[str, float] = {}

    for sensor in sensors:
        distance = _distance(cell.centroid, sensor.location)
        if distance > radius:
            continue

        weight = 1.0 / ((distance + 1e-6) ** power)
        for key, value in sensor.readings.items():
            weighted_totals[key] = weighted_totals.get(key, 0.0) + value * weight
            total_weights[key] = total_weights.get(key, 0.0) + weight

    return {
        key: weighted_totals[key] / total_weights[key]
        for key in weighted_totals
        if total_weights[key] > 0
    }


def derive_environmental_features(
    cell: RasterCell,
    sensor_features: Dict[str, float],
) -> Dict[str, float]:
    vegetation_stress = 1.0 - _normalize(cell.ndvi, 0.1, 0.9)
    thermal_stress = _normalize(cell.surface_temp_c, 18.0, 45.0)
    moisture_stress = 1.0 - _normalize(cell.moisture_index, 0.1, 0.9)

    pm25 = sensor_features.get("pm25", 8.0)
    humidity = sensor_features.get("humidity", 55.0)
    soil_moisture = sensor_features.get("soil_moisture", 0.45)
    water_ph = sensor_features.get("water_ph", 7.0)

    air_pollution_stress = _normalize(pm25, 5.0, 60.0)
    dry_air_stress = 1.0 - _normalize(humidity, 25.0, 90.0)
    soil_stress = 1.0 - _normalize(soil_moisture, 0.15, 0.75)
    water_quality_stress = min(abs(water_ph - 7.0) / 2.5, 1.0)

    return {
        "vegetation_stress": vegetation_stress,
        "thermal_stress": thermal_stress,
        "moisture_stress": moisture_stress,
        "air_pollution_stress": air_pollution_stress,
        "dry_air_stress": dry_air_stress,
        "soil_stress": soil_stress,
        "water_quality_stress": water_quality_stress,
    }


def compute_risk_score(derived_features: Dict[str, float]) -> float:
    weights = {
        "vegetation_stress": 0.22,
        "thermal_stress": 0.18,
        "moisture_stress": 0.18,
        "air_pollution_stress": 0.14,
        "dry_air_stress": 0.10,
        "soil_stress": 0.12,
        "water_quality_stress": 0.06,
    }
    total = 0.0
    for key, weight in weights.items():
        total += derived_features.get(key, 0.0) * weight
    return round(total, 4)


def fuse_cells(cells: List[RasterCell], sensors: List[SensorReading]) -> List[FusedCell]:
    fused: List[FusedCell] = []
    for cell in cells:
        sensor_features = interpolate_sensor_features(cell, sensors)
        derived = derive_environmental_features(cell, sensor_features)
        fused.append(
            FusedCell(
                cell=cell,
                sensor_features=sensor_features,
                derived_features=derived,
                risk_score=compute_risk_score(derived),
            )
        )
    return fused

