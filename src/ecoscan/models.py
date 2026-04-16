from dataclasses import dataclass
from typing import Dict, List, Tuple


Coordinate = Tuple[float, float]
Polygon = List[Coordinate]


@dataclass(frozen=True)
class RasterCell:
    cell_id: str
    centroid: Coordinate
    ndvi: float
    surface_temp_c: float
    moisture_index: float
    elevation_m: float


@dataclass(frozen=True)
class SensorReading:
    sensor_id: str
    location: Coordinate
    readings: Dict[str, float]


@dataclass(frozen=True)
class FusedCell:
    cell: RasterCell
    sensor_features: Dict[str, float]
    derived_features: Dict[str, float]
    risk_score: float


@dataclass(frozen=True)
class SpeciesPressure:
    common_name: str
    scientific_name: str
    kingdom: str
    habitat_need: str
    source_url: str
    vulnerability_score: float
    pressure_factors: List[str]
    narrative: str


@dataclass(frozen=True)
class HabitatZone:
    cell_id: str
    centroid: Coordinate
    polygon: Polygon
    habitat_type: str
    health_label: str
    biodiversity_score: float
    risk_score: float
    key_signals: List[str]
    habitat_story: str
    species_pressures: List[SpeciesPressure]
    recommended_actions: List[str]
