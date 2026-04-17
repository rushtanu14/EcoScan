from typing import Dict, List, Optional, Tuple

from .fusion import fuse_cells
from .models import HabitatZone, RasterCell, ScanCell, ScanDetection, SensorReading, SpeciesPressure


SPECIES_LIBRARY = [
    {
        "common_name": "Monarch butterfly",
        "scientific_name": "Danaus plexippus",
        "kingdom": "animal",
        "habitat_need": "Milkweed patches and nectar corridors",
        "source_url": "https://wildlife.ca.gov/Conservation/Invertebrates/Monarch-Butterfly",
        "image_asset": "/assets/species-monarch.svg",
        "example_images": ["/assets/species-monarch.svg", "/assets/species-california-milkweed.svg"],
        "aliases": ["monarch", "butterfly", "milkweed"],
        "factors": ["vegetation_stress", "dry_air_stress", "air_pollution_stress"],
        "narrative": "Milkweed patches and nectar corridors are thinning, which raises migration and breeding stress for monarchs.",
    },
    {
        "common_name": "California red-legged frog",
        "scientific_name": "Rana draytonii",
        "kingdom": "animal",
        "habitat_need": "Slow-moving freshwater and connected upland refuge",
        "source_url": "https://www.fws.gov/rivers/species/california-red-legged-frog-rana-draytonii",
        "image_asset": "/assets/species-frog.svg",
        "example_images": ["/assets/species-frog.svg", "/assets/species-western-pond-turtle.svg"],
        "aliases": ["frog", "amphibian", "wetland"],
        "factors": ["moisture_stress", "water_quality_stress", "thermal_stress"],
        "narrative": "Warm, drying wetland margins and altered water chemistry are shrinking safe breeding habitat for the frog.",
    },
    {
        "common_name": "Acorn woodpecker",
        "scientific_name": "Melanerpes formicivorus",
        "kingdom": "animal",
        "habitat_need": "Mature oaks, cavity trees, and reliable acorn stores",
        "source_url": "https://www.audubon.org/field-guide/bird/acorn-woodpecker",
        "image_asset": "/assets/species-acorn-woodpecker.svg",
        "example_images": ["/assets/species-acorn-woodpecker.svg", "/assets/species-valley-oak.svg"],
        "aliases": ["woodpecker", "bird", "oak"],
        "factors": ["vegetation_stress", "thermal_stress", "air_pollution_stress"],
        "narrative": "Oak canopy stress and hotter edge conditions are reducing food storage and nesting quality for woodpeckers.",
    },
    {
        "common_name": "Valley oak saplings",
        "scientific_name": "Quercus lobata",
        "kingdom": "plant",
        "habitat_need": "Deep-rooted riparian and savanna soils with groundwater access",
        "source_url": "https://research.fs.usda.gov/feis/species-reviews/quelob",
        "image_asset": "/assets/species-valley-oak.svg",
        "example_images": ["/assets/species-valley-oak.svg", "/assets/species-acorn-woodpecker.svg"],
        "aliases": ["oak", "sapling", "tree"],
        "factors": ["soil_stress", "thermal_stress", "dry_air_stress"],
        "narrative": "Dry, compacted soil and rising heat are weakening young valley oak recruitment across the corridor.",
    },
    {
        "common_name": "Western pond turtle",
        "scientific_name": "Actinemys marmorata",
        "kingdom": "animal",
        "habitat_need": "Clean creeks, quiet pools, and open basking banks",
        "source_url": "https://wildlife.ca.gov/Conservation/Reptiles/Western-Pond-Turtle",
        "image_asset": "/assets/species-western-pond-turtle.svg",
        "example_images": ["/assets/species-western-pond-turtle.svg", "/assets/species-frog.svg"],
        "aliases": ["turtle", "pond", "reptile"],
        "factors": ["water_quality_stress", "moisture_stress", "thermal_stress"],
        "narrative": "Reduced pool quality and hotter, shallower water are lowering refuge quality for western pond turtles.",
    },
    {
        "common_name": "Black phoebe",
        "scientific_name": "Sayornis nigricans",
        "kingdom": "animal",
        "habitat_need": "Streamside insect habitat and open riparian edges",
        "source_url": "https://www.allaboutbirds.org/guide/Black_Phoebe/overview",
        "image_asset": "/assets/species-black-phoebe.svg",
        "example_images": ["/assets/species-black-phoebe.svg", "/assets/species-frog.svg"],
        "aliases": ["phoebe", "bird", "riparian"],
        "factors": ["air_pollution_stress", "vegetation_stress", "dry_air_stress"],
        "narrative": "Insect decline and degraded streamside cover are likely reducing foraging quality for black phoebes.",
    },
    {
        "common_name": "California milkweed",
        "scientific_name": "Asclepias californica",
        "kingdom": "plant",
        "habitat_need": "Sunny native grassland edges with low pesticide pressure",
        "source_url": "https://wildlife.ca.gov/Conservation/Invertebrates/Monarch-Butterfly",
        "image_asset": "/assets/species-california-milkweed.svg",
        "example_images": ["/assets/species-california-milkweed.svg", "/assets/species-monarch.svg"],
        "aliases": ["milkweed", "plant", "grassland"],
        "factors": ["vegetation_stress", "soil_stress", "dry_air_stress"],
        "narrative": "Drying grassland edges are reducing milkweed vigor, which weakens the host plant base for monarch breeding.",
    },
    {
        "common_name": "Coyote brush",
        "scientific_name": "Baccharis pilularis",
        "kingdom": "plant",
        "habitat_need": "Native scrub edges that buffer wind and heat",
        "source_url": "https://calscape.org/Baccharis-pilularis-(Coyote-Brush)",
        "image_asset": "/assets/species-coyote-brush.svg",
        "example_images": ["/assets/species-coyote-brush.svg", "/assets/species-california-milkweed.svg"],
        "aliases": ["coyote", "brush", "shrub"],
        "factors": ["soil_stress", "dry_air_stress", "thermal_stress"],
        "narrative": "Heat and soil stress are reducing shrub cover that normally buffers edge habitat for birds and insects.",
    },
]

HABITAT_WEIGHTS = {
    "wetland edge": {
        "California red-legged frog": 1.2,
        "Western pond turtle": 1.14,
        "Monarch butterfly": 0.93,
        "Black phoebe": 1.06,
        "Valley oak saplings": 0.88,
    },
    "woodland corridor": {
        "Acorn woodpecker": 1.2,
        "Valley oak saplings": 1.08,
        "Black phoebe": 0.94,
        "California milkweed": 0.9,
        "Monarch butterfly": 0.95,
    },
    "urban heat fringe": {
        "Monarch butterfly": 1.15,
        "California milkweed": 1.12,
        "Valley oak saplings": 1.08,
        "Coyote brush": 1.05,
        "Acorn woodpecker": 0.92,
    },
    "mixed grassland": {
        "Valley oak saplings": 1.07,
        "Monarch butterfly": 1.04,
        "California milkweed": 1.1,
        "Coyote brush": 1.08,
        "Acorn woodpecker": 0.94,
    },
}


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
    habitat_need: str,
    source_url: str,
    image_asset: str,
    example_images: List[str],
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
        habitat_need=habitat_need,
        source_url=source_url,
        image_asset=image_asset,
        example_images=example_images,
        vulnerability_score=score,
        pressure_factors=ordered_factors[:2],
        narrative=narrative,
    )


def infer_species_pressures(derived_features: Dict[str, float], habitat_type: str) -> List[SpeciesPressure]:
    pressures = []
    for profile in SPECIES_LIBRARY:
        pressure = _species_pressure(
            profile["common_name"],
            profile["scientific_name"],
            profile["kingdom"],
            profile["habitat_need"],
            profile["source_url"],
            profile["image_asset"],
            profile["example_images"],
            derived_features,
            profile["factors"],
            profile["narrative"],
        )
        multiplier = HABITAT_WEIGHTS.get(habitat_type, {}).get(profile["common_name"], 1.0)
        pressures.append(
            SpeciesPressure(
                common_name=pressure.common_name,
                scientific_name=pressure.scientific_name,
                kingdom=pressure.kingdom,
                habitat_need=pressure.habitat_need,
                source_url=pressure.source_url,
                image_asset=pressure.image_asset,
                example_images=pressure.example_images,
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


def species_profile(common_name: str) -> Dict[str, object]:
    for profile in SPECIES_LIBRARY:
        if profile["common_name"] == common_name:
            return profile
    raise KeyError(f"Unknown species: {common_name}")


def _project_polygon(
    polygon: List[Tuple[float, float]],
    bounds: Dict[str, float],
) -> List[Tuple[float, float]]:
    west = bounds["west"]
    east = bounds["east"]
    south = bounds["south"]
    north = bounds["north"]
    lon_span = max(east - west, 1e-6)
    lat_span = max(north - south, 1e-6)

    projected: List[Tuple[float, float]] = []
    for lon, lat in polygon:
        x = (lon - west) / lon_span
        y = (north - lat) / lat_span
        projected.append((round(x, 4), round(y, 4)))
    return projected


def build_scan_model(
    zones: List[HabitatZone],
    bounds: Dict[str, float],
) -> List[ScanCell]:
    scan_cells: List[ScanCell] = []
    for index, zone in enumerate(zones):
        lead = zone.species_pressures[0]
        secondary = zone.species_pressures[1]
        scan_cells.append(
            ScanCell(
                cell_id=zone.cell_id,
                risk_score=zone.risk_score,
                health_label=zone.health_label,
                habitat_type=zone.habitat_type,
                projected_polygon=_project_polygon(zone.polygon, bounds),
                canopy_height=round(0.22 + (zone.biodiversity_score / 100) * 0.68, 3),
                lead_species=lead.common_name,
                detections=[
                    ScanDetection(
                        species_name=lead.common_name,
                        confidence=round(min(0.98, 0.55 + lead.vulnerability_score * 0.4), 3),
                        risk_level=speciesRiskLevel(lead.vulnerability_score),
                        note=f"{lead.common_name} is driving the strongest alert in this {zone.habitat_type}.",
                        action_items=zone.recommended_actions[:2],
                    ),
                    ScanDetection(
                        species_name=secondary.common_name,
                        confidence=round(min(0.96, 0.48 + secondary.vulnerability_score * 0.35 + index * 0.002), 3),
                        risk_level=speciesRiskLevel(secondary.vulnerability_score),
                        note=f"{secondary.common_name} is the secondary signal in the same scan slice.",
                        action_items=zone.recommended_actions[1:3] or zone.recommended_actions[:1],
                    ),
                ],
            )
        )
    return scan_cells


def speciesRiskLevel(score: float) -> str:
    return classify_habitat_health(score)


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
        species_pressures = infer_species_pressures(fused.derived_features, habitat_type)
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


def summarize_species_catalog(zones: List[HabitatZone]) -> List[Dict[str, object]]:
    aggregate: Dict[str, Dict[str, object]] = {}

    for zone in zones:
        for pressure in zone.species_pressures:
            current = aggregate.setdefault(
                pressure.common_name,
                {
                    "common_name": pressure.common_name,
                    "scientific_name": pressure.scientific_name,
                    "kingdom": pressure.kingdom,
                    "habitat_need": pressure.habitat_need,
                    "source_url": pressure.source_url,
                    "image_asset": pressure.image_asset,
                    "example_images": pressure.example_images,
                    "narrative": pressure.narrative,
                    "max_vulnerability_score": 0.0,
                    "avg_vulnerability_score": 0.0,
                    "pressure_factors": [],
                    "stressed_habitat_count": 0,
                    "total_habitats": 0,
                },
            )
            current["max_vulnerability_score"] = max(current["max_vulnerability_score"], pressure.vulnerability_score)
            current["avg_vulnerability_score"] += pressure.vulnerability_score
            current["total_habitats"] += 1
            if zone.health_label != "thriving":
                current["stressed_habitat_count"] += 1
            current["pressure_factors"].extend(pressure.pressure_factors)

    catalog: List[Dict[str, object]] = []
    for item in aggregate.values():
        item["avg_vulnerability_score"] = round(item["avg_vulnerability_score"] / item["total_habitats"], 4)
        item["pressure_factors"] = list(dict.fromkeys(item["pressure_factors"]))[:4]
        item["status_label"] = classify_habitat_health(item["avg_vulnerability_score"])
        item["action_items"] = recommend_actions(item["pressure_factors"])
        item["aliases"] = species_profile(item["common_name"])["aliases"]
        catalog.append(item)

    return sorted(catalog, key=lambda species: species["avg_vulnerability_score"], reverse=True)
