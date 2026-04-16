import random
from typing import Dict, List, Tuple

from .models import RasterCell, SensorReading


DEMO_STUDY_AREA = {
    "name": "Coyote Creek Biodiversity Corridor",
    "region": "South San Jose, California",
    "bounds": {
        "west": -121.92,
        "east": -121.78,
        "south": 37.20,
        "north": 37.31,
    },
    "story": "A riparian corridor squeezed by roads, dry grassland, and urban heat where wetlands and oak patches still support vulnerable species.",
}

DEMO_LANDMARKS = [
    {"name": "Coyote Creek", "kind": "waterway", "coordinates": [(-121.89, 37.305), (-121.865, 37.27), (-121.84, 37.225)]},
    {"name": "Wetland Refuge", "kind": "refuge", "coordinates": [(-121.905, 37.295), (-121.885, 37.29), (-121.89, 37.27), (-121.91, 37.275)]},
    {"name": "Urban Edge", "kind": "urban_edge", "coordinates": [(-121.81, 37.305), (-121.785, 37.305), (-121.785, 37.235), (-121.81, 37.235)]},
]


def _bounded(value: float, lower: float, upper: float) -> float:
    return round(min(max(value, lower), upper), 3)


def _interpolate(value: float, lower: float, upper: float) -> float:
    return round(lower + (upper - lower) * value, 6)


def _cell_polygon(row: int, col: int, rows: int, cols: int) -> List[Tuple[float, float]]:
    bounds = DEMO_STUDY_AREA["bounds"]
    lat_step = (bounds["north"] - bounds["south"]) / rows
    lon_step = (bounds["east"] - bounds["west"]) / cols

    west = bounds["west"] + lon_step * col
    east = west + lon_step
    north = bounds["north"] - lat_step * row
    south = north - lat_step

    return [
        (round(west, 6), round(north, 6)),
        (round(east, 6), round(north, 6)),
        (round(east, 6), round(south, 6)),
        (round(west, 6), round(south, 6)),
    ]


def build_demo_map(rows: int, cols: int) -> Dict[str, object]:
    return {
        "study_area": DEMO_STUDY_AREA,
        "landmarks": DEMO_LANDMARKS,
        "cell_polygons": {
            f"cell-{row}-{col}": _cell_polygon(row, col, rows, cols)
            for row in range(rows)
            for col in range(cols)
        },
    }


def generate_demo_grid(rows: int = 6, cols: int = 6, seed: int = 7) -> List[RasterCell]:
    rng = random.Random(seed)
    cells: List[RasterCell] = []
    bounds = DEMO_STUDY_AREA["bounds"]

    for row in range(rows):
        for col in range(cols):
            x = col / max(cols - 1, 1)
            y = row / max(rows - 1, 1)
            lon = _interpolate(x, bounds["west"], bounds["east"])
            lat = _interpolate(1 - y, bounds["south"], bounds["north"])

            heat_bias = 0.22 if col >= cols // 2 else 0.03
            dryness_bias = 0.17 if row <= rows // 3 else 0.02
            riparian_bonus = 0.16 if row >= rows // 2 and col <= cols // 3 else 0.0

            cells.append(
                RasterCell(
                    cell_id=f"cell-{row}-{col}",
                    centroid=(lon, lat),
                    ndvi=round(0.24 + riparian_bonus + rng.uniform(0.0, 0.44), 4),
                    surface_temp_c=round(21.0 + heat_bias * 24 + rng.uniform(0.0, 10.0), 2),
                    moisture_index=round(0.23 + rng.uniform(0.0, 0.42) - dryness_bias, 4),
                    elevation_m=round(18 + row * 4 + col * 1.8 + rng.uniform(-1.2, 1.2), 2),
                )
            )
    return cells


def generate_demo_sensors(seed: int = 11) -> List[SensorReading]:
    rng = random.Random(seed)
    anchors: List[Tuple[str, Tuple[float, float], dict[str, float]]] = [
        (
            "roadside-fragment",
            (-121.805, 37.258),
            {
                "pm25": 42.0,
                "humidity": 33.0,
                "soil_moisture": 0.22,
                "water_ph": 6.4,
            },
        ),
        (
            "wetland-refuge",
            (-121.902, 37.286),
            {
                "pm25": 10.0,
                "humidity": 74.0,
                "soil_moisture": 0.69,
                "water_ph": 7.2,
            },
        ),
        (
            "forest-interior",
            (-121.874, 37.246),
            {
                "pm25": 15.0,
                "humidity": 61.0,
                "soil_moisture": 0.56,
                "water_ph": 7.0,
            },
        ),
        (
            "dry-grassland",
            (-121.836, 37.301),
            {
                "pm25": 26.0,
                "humidity": 39.0,
                "soil_moisture": 0.28,
                "water_ph": 6.8,
            },
        ),
    ]

    sensors: List[SensorReading] = []
    for sensor_id, location, base in anchors:
        jittered = {
            "pm25": _bounded(base["pm25"] + rng.uniform(-1.5, 1.5), 3.0, 80.0),
            "humidity": _bounded(base["humidity"] + rng.uniform(-1.5, 1.5), 15.0, 100.0),
            "soil_moisture": _bounded(base["soil_moisture"] + rng.uniform(-0.08, 0.08), 0.05, 0.9),
            "water_ph": _bounded(base["water_ph"] + rng.uniform(-0.2, 0.2), 5.5, 8.5),
        }
        sensors.append(SensorReading(sensor_id=sensor_id, location=location, readings=jittered))
    return sensors
