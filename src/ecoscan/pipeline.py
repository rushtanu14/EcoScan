from typing import Dict, List, Optional, Tuple

from .fusion import fuse_cells
from .models import HabitatZone, RasterCell, SensorReading, SpeciesPressure


def classify_habitat_health(risk_score: float) -> str:
    if risk_score >= 0.68:
        return "fragile"
    if risk_score >= 0.42:
        return "stressed"
    return "thriving"


def infer_habitat_type(cell: RasterCell) -> str:
    if cell.moisture_index >= 0.58:
        return "wetland edge"
    if cell.ndvi >= 0.55 and cell.surface_temp_c <= 29:
        return "woodland corridor"
    if cell.surface_temp_c >= 31 and cell.ndvi <= 0.42:
        return "urban heat fringe"
    return "mixed grassland"


def _top_signals(derived_features: Dict[str, float], limit: int = 3) -> List[str]:
    ordered = sorted(derived_features.items(), key=lambda item: item[1], reverse=True)
    return [name for name, _ in ordered[:limit]]


def _species_pressure(
    common_name: str,
    scientific_name: str,
    kingdom: str,
    derived_features: Dict[str, float],
    factors: List[str],
    narrative: str,
) -> SpeciesPressure:
    score = round(sum(derived_features.get(factor, 0.0) for factor in factors) / len(factors), 4)
    ordered_factors = sorted(factors, key=lambda factor: derived_features.get(factor, 0.0), reverse=True)
    return SpeciesPressure(
        common_name=common_name,
        scientific_name=scientific_name,
        kingdom=kingdom,
        vulnerability_score=score,
        pressure_factors=ordered_factors[:2],
        narrative=narrative,
    )


def infer_species_pressures(derived_features: Dict[str, float], habitat_type: str) -> List[SpeciesPressure]:
    profiles = [
        (
            "Monarch butterfly",
            "Danaus plexippus",
            "animal",
            ["vegetation_stress", "dry_air_stress", "air_pollution_stress"],
            "Milkweed patches and nectar corridors are thinning, which raises migration and breeding stress for monarchs.",
        ),
        (
            "California red-legged frog",
            "Rana draytonii",
            "animal",
            ["moisture_stress", "water_quality_stress", "thermal_stress"],
            "Warm, drying wetland margins and altered water chemistry are shrinking safe breeding habitat for the frog.",
        ),
        (
            "Acorn woodpecker",
            "Melanerpes formicivorus",
            "animal",
            ["vegetation_stress", "thermal_stress", "air_pollution_stress"],
            "Oak canopy stress and hotter edge conditions are reducing food storage and nesting quality for woodpeckers.",
        ),
        (
            "Valley oak saplings",
            "Quercus lobata",
            "plant",
            ["soil_stress", "thermal_stress", "dry_air_stress"],
            "Dry, compacted soil and rising heat are weakening young valley oak recruitment across the corridor.",
        ),
    ]
    habitat_weights = {
        "wetland edge": {
            "California red-legged frog": 1.18,
            "Monarch butterfly": 0.94,
            "Acorn woodpecker": 0.9,
            "Valley oak saplings": 0.88,
        },
        "woodland corridor": {
            "Acorn woodpecker": 1.18,
            "Valley oak saplings": 1.05,
            "Monarch butterfly": 0.96,
            "California red-legged frog": 0.9,
        },
        "urban heat fringe": {
            "Monarch butterfly": 1.12,
            "Valley oak saplings": 1.08,
            "Acorn woodpecker": 0.95,
            "California red-legged frog": 0.88,
        },
        "mixed grassland": {
            "Valley oak saplings": 1.06,
            "Monarch butterfly": 1.03,
            "Acorn woodpecker": 0.94,
            "California red-legged frog": 0.9,
        },
    }

    pressures = []
    for common_name, scientific_name, kingdom, factors, narrative in profiles:
        pressure = _species_pressure(common_name, scientific_name, kingdom, derived_features, factors, narrative)
        multiplier = habitat_weights.get(habitat_type, {}).get(common_name, 1.0)
        pressures.append(
            SpeciesPressure(
                common_name=pressure.common_name,
                scientific_name=pressure.scientific_name,
                kingdom=pressure.kingdom,
                vulnerability_score=round(min(1.0, pressure.vulnerability_score * multiplier), 4),
                pressure_factors=pressure.pressure_factors,
                narrative=pressure.narrative,
            )
        )
    return sorted(pressures, key=lambda item: item.vulnerability_score, reverse=True)


def habitat_story(habitat_type: str, health_label: str, lead_species: SpeciesPressure) -> str:
    stories = {
        "wetland edge": f"The strongest signal here is {lead_species.common_name}, showing how wetland refuge conditions now register as {health_label}.",
        "woodland corridor": f"The clearest signal in this oak-linked corridor is {lead_species.common_name}, with canopy resilience currently reading as {health_label}.",
        "urban heat fringe": f"The biggest warning along this urban edge is {lead_species.common_name}, where heat and fragmentation are pushing the habitat into a {health_label} state.",
        "mixed grassland": f"The clearest signal in this transition grassland is {lead_species.common_name}, where drying soil is driving a {health_label} habitat condition.",
    }
    return stories.get(habitat_type, f"The clearest ecological signal in this {health_label} habitat is {lead_species.common_name}.")


def recommend_actions(key_signals: List[str]) -> List[str]:
    mapping = {
        "vegetation_stress": "Restore native vegetation buffers and expand shaded habitat corridors.",
        "thermal_stress": "Prioritize cooling interventions such as canopy cover, reflective surfaces, and water retention.",
        "moisture_stress": "Improve water retention with soil restoration, swales, and reduced runoff.",
        "air_pollution_stress": "Target nearby emission hotspots and install denser biomonitoring near affected habitats.",
        "dry_air_stress": "Increase habitat humidity resilience with denser planting and wet microhabitats.",
        "soil_stress": "Stabilize soil health using organic remediation and lower-disturbance land management.",
        "water_quality_stress": "Investigate runoff contamination and protect aquatic refuge zones immediately.",
    }
    actions: List[str] = []
    for signal in key_signals:
        action = mapping.get(signal)
        if action and action not in actions:
            actions.append(action)
    return actions[:3]


def build_habitat_model(
    raster_cells: List[RasterCell],
    sensor_readings: List[SensorReading],
    cell_polygons: Optional[Dict[str, List[Tuple[float, float]]]] = None,
) -> List[HabitatZone]:
    fused_cells = fuse_cells(raster_cells, sensor_readings)
    zones: List[HabitatZone] = []

    for fused in sorted(fused_cells, key=lambda item: item.risk_score, reverse=True):
        habitat_type = infer_habitat_type(fused.cell)
        key_signals = _top_signals(fused.derived_features)
        species_pressures = infer_species_pressures(fused.derived_features, habitat_type)[:3]
        health_label = classify_habitat_health(fused.risk_score)
        biodiversity_score = round(max(0.0, 1.0 - fused.risk_score) * 100, 2)
        zones.append(
            HabitatZone(
                cell_id=fused.cell.cell_id,
                centroid=fused.cell.centroid,
                polygon=cell_polygons.get(fused.cell.cell_id, []) if cell_polygons else [],
                habitat_type=habitat_type,
                health_label=health_label,
                biodiversity_score=biodiversity_score,
                risk_score=fused.risk_score,
                key_signals=key_signals,
                habitat_story=habitat_story(habitat_type, health_label, species_pressures[0]),
                species_pressures=species_pressures,
                recommended_actions=recommend_actions(key_signals),
            )
        )

    return zones


def summarize_habitat_zones(zones: List[HabitatZone]) -> Dict[str, object]:
    if not zones:
        return {
            "avg_biodiversity_score": 0.0,
            "fragile_cells": 0,
            "stressed_cells": 0,
            "thriving_cells": 0,
            "top_species_at_risk": [],
            "priority_actions": [],
        }

    avg_score = round(sum(zone.biodiversity_score for zone in zones) / len(zones), 2)
    health_counts = {
        "fragile_cells": sum(1 for zone in zones if zone.health_label == "fragile"),
        "stressed_cells": sum(1 for zone in zones if zone.health_label == "stressed"),
        "thriving_cells": sum(1 for zone in zones if zone.health_label == "thriving"),
    }

    species_totals: Dict[str, float] = {}
    for zone in zones:
        for pressure in zone.species_pressures:
            species_totals[pressure.common_name] = species_totals.get(pressure.common_name, 0.0) + pressure.vulnerability_score

    top_species = [
        species
        for species, _ in sorted(species_totals.items(), key=lambda item: item[1], reverse=True)[:3]
    ]

    priority_actions: List[str] = []
    for zone in zones[:5]:
        for action in zone.recommended_actions:
            if action not in priority_actions:
                priority_actions.append(action)

    return {
        "avg_biodiversity_score": avg_score,
        **health_counts,
        "top_species_at_risk": top_species,
        "priority_actions": priority_actions[:4],
    }
