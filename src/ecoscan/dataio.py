import csv
import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .demo import build_demo_map, generate_demo_grid, generate_demo_sensors
from .models import RasterCell, SensorReading


MapData = Dict[str, object]


def _parse_float(row: Dict[str, str], key: str) -> float:
    value = row.get(key)
    if value is None or value == "":
        raise ValueError(f"Missing required numeric field '{key}'")
    return float(value)


def load_raster_cells_csv(path: Path) -> List[RasterCell]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {
            "cell_id",
            "centroid_lon",
            "centroid_lat",
            "ndvi",
            "surface_temp_c",
            "moisture_index",
            "elevation_m",
        }
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing habitat columns: {', '.join(sorted(missing))}")

        cells: List[RasterCell] = []
        for row in reader:
            cells.append(
                RasterCell(
                    cell_id=row["cell_id"],
                    centroid=(_parse_float(row, "centroid_lon"), _parse_float(row, "centroid_lat")),
                    ndvi=_parse_float(row, "ndvi"),
                    surface_temp_c=_parse_float(row, "surface_temp_c"),
                    moisture_index=_parse_float(row, "moisture_index"),
                    elevation_m=_parse_float(row, "elevation_m"),
                )
            )
    return cells


def load_sensor_readings_csv(path: Path) -> List[SensorReading]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"sensor_id", "lon", "lat", "pm25", "humidity", "soil_moisture", "water_ph"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing sensor columns: {', '.join(sorted(missing))}")

        sensors: List[SensorReading] = []
        for row in reader:
            sensors.append(
                SensorReading(
                    sensor_id=row["sensor_id"],
                    location=(_parse_float(row, "lon"), _parse_float(row, "lat")),
                    readings={
                        "pm25": _parse_float(row, "pm25"),
                        "humidity": _parse_float(row, "humidity"),
                        "soil_moisture": _parse_float(row, "soil_moisture"),
                        "water_ph": _parse_float(row, "water_ph"),
                    },
                )
            )
    return sensors


def load_map_json(path: Path) -> MapData:
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    if "study_area" not in payload or "cell_polygons" not in payload:
        raise ValueError("Map JSON must contain 'study_area' and 'cell_polygons'")

    normalized_polygons = {
        cell_id: [tuple(point) for point in points]
        for cell_id, points in payload["cell_polygons"].items()
    }
    return {
        "study_area": payload["study_area"],
        "landmarks": payload.get("landmarks", []),
        "cell_polygons": normalized_polygons,
    }


def resolve_input_paths(
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> Tuple[Optional[Path], Optional[Path], Optional[Path]]:
    base = Path(data_dir).resolve() if data_dir else None

    def _pick(explicit: Optional[str], default_name: str) -> Optional[Path]:
        if explicit:
            return Path(explicit).resolve()
        if base:
            candidate = base / default_name
            if candidate.exists():
                return candidate.resolve()
        return None

    return _pick(cells_file, "habitats.csv"), _pick(sensors_file, "sensors.csv"), _pick(map_file, "map.json")


def load_input_bundle(
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> Tuple[List[RasterCell], List[SensorReading], MapData]:
    resolved_cells, resolved_sensors, resolved_map = resolve_input_paths(data_dir, cells_file, sensors_file, map_file)

    if not any([resolved_cells, resolved_sensors, resolved_map]):
        return generate_demo_grid(rows=rows, cols=cols), generate_demo_sensors(), build_demo_map(rows=rows, cols=cols)

    if not resolved_cells or not resolved_sensors:
        raise ValueError("Custom input mode requires both habitat and sensor files.")

    cells = load_raster_cells_csv(resolved_cells)
    sensors = load_sensor_readings_csv(resolved_sensors)

    if resolved_map:
        map_data = load_map_json(resolved_map)
    else:
        map_data = {
            "study_area": {
                "name": "Custom EcoScan Study Area",
                "region": "Imported from CSV inputs",
                "bounds": _bounds_from_cells(cells),
                "story": "Custom study area loaded from local files.",
            },
            "landmarks": [],
            "cell_polygons": {},
        }

    return cells, sensors, map_data


def _bounds_from_cells(cells: Sequence[RasterCell]) -> Dict[str, float]:
    lons = [cell.centroid[0] for cell in cells]
    lats = [cell.centroid[1] for cell in cells]
    return {
        "west": min(lons),
        "east": max(lons),
        "south": min(lats),
        "north": max(lats),
    }
