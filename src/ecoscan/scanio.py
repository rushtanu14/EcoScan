import base64
import io
import math
from dataclasses import asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from .calibration import get_score_calibrator
from .models import HabitatZone, ScanCell, ScanDetection


Point3D = Tuple[float, float, float]


def _parse_obj_text(content: str) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    vertices: List[Point3D] = []
    faces: List[Tuple[int, int, int]] = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("v "):
            parts = stripped.split()
            if len(parts) >= 4:
                vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif stripped.startswith("f "):
            parts = stripped.split()[1:]
            if len(parts) >= 3:
                face = []
                for part in parts[:3]:
                    face.append(int(part.split("/")[0]) - 1)
                faces.append(tuple(face))
    return np.asarray(vertices, dtype=float), np.asarray(faces, dtype=int) if faces else None


def _parse_xyz_text(content: str) -> np.ndarray:
    points: List[Point3D] = []
    for line in content.splitlines():
        parts = line.replace(",", " ").split()
        if len(parts) < 3:
            continue
        try:
            points.append((float(parts[0]), float(parts[1]), float(parts[2])))
        except ValueError:
            continue
    return np.asarray(points, dtype=float)


def parse_scan_content(filename: str, content: str) -> List[Point3D]:
    points, _faces, _meta = parse_scan_bytes(filename, content.encode("utf-8"))
    return [tuple(point.tolist()) for point in points]


def parse_scan_bytes(filename: str, data: bytes) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, object]]:
    lower = filename.lower()
    suffix = Path(filename).suffix.lower()

    if suffix in {".las", ".laz"}:
        import laspy

        las = laspy.read(io.BytesIO(data))
        points = np.column_stack((las.x, las.y, las.z)).astype(float)
        metadata = {
            "source_epsg": getattr(las.header.parse_crs(), "to_epsg", lambda: None)() if las.header.parse_crs() else None,
            "point_format": las.header.point_format.id,
            "scale": tuple(float(value) for value in las.header.scales),
            "offset": tuple(float(value) for value in las.header.offsets),
            "point_count": int(las.header.point_count),
        }
        return points, None, metadata

    if suffix in {".obj"}:
        text = data.decode("utf-8", errors="ignore")
        points, faces = _parse_obj_text(text)
        return points, faces, {"source_epsg": None, "point_count": int(len(points))}

    if suffix in {".xyz", ".pts", ".txt"}:
        text = data.decode("utf-8", errors="ignore")
        points = _parse_xyz_text(text)
        return points, None, {"source_epsg": None, "point_count": int(len(points))}

    import trimesh

    mesh_or_scene = trimesh.load(io.BytesIO(data), file_type=suffix.lstrip("."), force="scene")
    geometry = []
    if isinstance(mesh_or_scene, trimesh.Scene):
        geometry = [geom for geom in mesh_or_scene.geometry.values()]
    else:
        geometry = [mesh_or_scene]

    mesh_parts = []
    for geom in geometry:
        if hasattr(geom, "vertices") and len(geom.vertices):
            mesh_parts.append(geom)

    if not mesh_parts:
        raise ValueError("Unsupported or empty scan upload")

    vertices = np.concatenate([np.asarray(mesh.vertices, dtype=float) for mesh in mesh_parts], axis=0)
    faces_list = []
    offset = 0
    for mesh in mesh_parts:
        if hasattr(mesh, "faces") and len(mesh.faces):
            faces_list.append(np.asarray(mesh.faces, dtype=int) + offset)
        offset += len(mesh.vertices)
    faces = np.concatenate(faces_list, axis=0) if faces_list else None
    metadata = {"source_epsg": None, "point_count": int(len(vertices)), "mesh_parts": len(mesh_parts)}
    return vertices, faces, metadata


def _normalize_points(points: np.ndarray) -> np.ndarray:
    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    spans = np.maximum(maxs - mins, 1e-6)
    return (points - mins) / spans


def _is_wgs84_like(points: np.ndarray) -> bool:
    xs = points[:, 0]
    ys = points[:, 1]
    return xs.min() >= -180.0 and xs.max() <= 180.0 and ys.min() >= -90.0 and ys.max() <= 90.0


def _project_to_wgs84(points: np.ndarray, source_epsg: Optional[int]) -> Optional[np.ndarray]:
    if points.size == 0:
        return None
    if _is_wgs84_like(points):
        return points
    if not source_epsg:
        return None

    from pyproj import Transformer

    transformer = Transformer.from_crs(f"EPSG:{source_epsg}", "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(points[:, 0], points[:, 1])
    projected = np.column_stack((lon, lat, points[:, 2]))
    return projected


def _align_to_study_area(points: np.ndarray, study_area_bounds: Dict[str, float]) -> np.ndarray:
    normalized = _normalize_points(points)
    west = study_area_bounds["west"]
    east = study_area_bounds["east"]
    south = study_area_bounds["south"]
    north = study_area_bounds["north"]
    lon = west + normalized[:, 0] * (east - west)
    lat = south + normalized[:, 1] * (north - south)
    return np.column_stack((lon, lat, normalized[:, 2]))


def _project_habitat_points(habitats: Sequence[HabitatZone]) -> Dict[str, Tuple[float, float]]:
    xs = [habitat.centroid[0] for habitat in habitats]
    ys = [habitat.centroid[1] for habitat in habitats]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    return {
        habitat.cell_id: ((habitat.centroid[0] - min_x) / span_x, (habitat.centroid[1] - min_y) / span_y)
        for habitat in habitats
    }


def _nearest_habitat(point: Tuple[float, float], habitats: Sequence[HabitatZone], projected: Dict[str, Tuple[float, float]]) -> HabitatZone:
    return min(
        habitats,
        key=lambda habitat: (projected[habitat.cell_id][0] - point[0]) ** 2 + (projected[habitat.cell_id][1] - point[1]) ** 2,
    )


def _cluster_point_cloud(points: np.ndarray) -> List[np.ndarray]:
    try:
        from sklearn.cluster import DBSCAN
    except Exception:
        return [np.arange(len(points))]

    if len(points) <= 1:
        return [np.arange(len(points))]
    labels = DBSCAN(eps=0.14, min_samples=max(3, min(10, len(points) // 50 or 3))).fit(points).labels_
    segments: List[np.ndarray] = []
    for label in sorted(set(labels)):
        if label == -1:
            continue
        indices = np.where(labels == label)[0]
        if len(indices):
            segments.append(indices)
    return segments or [np.arange(len(points))]


def _mesh_segments(vertices: np.ndarray, faces: np.ndarray) -> List[Dict[str, object]]:
    import trimesh

    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    components = mesh.split(only_watertight=False)
    segments: List[Dict[str, object]] = []
    for index, component in enumerate(components):
        if len(component.vertices) == 0:
            continue
        segments.append(
            {
                "id": f"mesh-segment-{index}",
                "points": np.asarray(component.vertices, dtype=float),
                "faces": np.asarray(component.faces, dtype=int),
                "surface_area": float(component.area),
                "segment_kind": "mesh-surface",
            }
        )
    return segments


def _point_segments(points: np.ndarray) -> List[Dict[str, object]]:
    segments: List[Dict[str, object]] = []
    for index, indices in enumerate(_cluster_point_cloud(points)):
        segment_points = points[indices]
        if len(segment_points) == 0:
            continue
        extents = segment_points.max(axis=0) - segment_points.min(axis=0)
        surface_area = float(max(extents[0] * extents[1], 1e-6))
        segments.append(
            {
                "id": f"point-segment-{index}",
                "points": segment_points,
                "faces": None,
                "surface_area": surface_area,
                "segment_kind": "point-cluster",
            }
        )
    return segments


def _segment_polygon(points: np.ndarray) -> List[Tuple[float, float]]:
    min_x, min_y = points[:, 0].min(), points[:, 1].min()
    max_x, max_y = points[:, 0].max(), points[:, 1].max()
    return [
        (float(round(float(min_x), 6)), float(round(float(min_y), 6))),
        (float(round(float(max_x), 6)), float(round(float(min_y), 6))),
        (float(round(float(max_x), 6)), float(round(float(max_y), 6))),
        (float(round(float(min_x), 6)), float(round(float(max_y), 6))),
    ]


def _segment_world_polygon(points: np.ndarray) -> List[Tuple[float, float, float]]:
    polygon = _segment_polygon(points)
    height = float(points[:, 2].max())
    return [(float(lon), float(lat), float(round(height, 6))) for lon, lat in polygon]


def _normalize_polygon(points: np.ndarray, all_points: np.ndarray) -> List[Tuple[float, float]]:
    mins = all_points.min(axis=0)
    maxs = all_points.max(axis=0)
    spans = np.maximum(maxs - mins, 1e-6)
    polygon = _segment_polygon(points)
    return [
        (round((x - mins[0]) / spans[0], 4), round((y - mins[1]) / spans[1], 4))
        for x, y in polygon
    ]


def _segment_density(segment_points: np.ndarray, total_points: int) -> float:
    return min(len(segment_points) / max(total_points, 1), 1.0)


def _explanation_for_segment(
    lead_species: str,
    adjusted_risk: float,
    raw_confidence: float,
    calibrated_confidence: float,
    habitat_prior: float,
    density: float,
    surface_area: float,
    segment_kind: str,
) -> Dict[str, object]:
    return {
        "segment_kind": segment_kind,
        "detector_score": round(raw_confidence, 4),
        "calibrated_score": round(calibrated_confidence, 4),
        "habitat_prior": round(habitat_prior, 4),
        "segment_density": round(density, 4),
        "surface_area": round(surface_area, 4),
        "risk_score": round(adjusted_risk, 4),
        "reason": f"Surface geometry and habitat overlap jointly elevated {lead_species} in this segment.",
    }


def ingest_scan(
    filename: str,
    content: str,
    habitats: Sequence[HabitatZone],
    metadata: Optional[Dict[str, object]] = None,
) -> Dict[str, object]:
    metadata = metadata or {}
    raw_bytes = base64.b64decode(content) if metadata.get("encoding") == "base64" else content.encode("utf-8")
    points, faces, file_metadata = parse_scan_bytes(filename, raw_bytes)
    # Allow small but valid uploads such as quick field samples or minimal triangle meshes.
    if len(points) < 3:
        raise ValueError("Scan file must include at least 3 vertices or points")

    source_epsg = metadata.get("source_epsg") or file_metadata.get("source_epsg")
    study_area_bounds = metadata.get("study_area_bounds") or {
        "west": min(habitat.centroid[0] for habitat in habitats),
        "east": max(habitat.centroid[0] for habitat in habitats),
        "south": min(habitat.centroid[1] for habitat in habitats),
        "north": max(habitat.centroid[1] for habitat in habitats),
    }

    world_points = _project_to_wgs84(points, int(source_epsg) if source_epsg else None)
    if world_points is None:
        world_points = _align_to_study_area(points, study_area_bounds)

    normalized_points = _normalize_points(world_points)
    projected_habitats = _project_habitat_points(habitats)
    calibrator = get_score_calibrator()
    segments = _mesh_segments(world_points, faces) if faces is not None and len(faces) else _point_segments(world_points)
    scan_cells: List[ScanCell] = []

    for index, segment in enumerate(sorted(segments, key=lambda item: len(item["points"]), reverse=True)):
        segment_points = np.asarray(segment["points"], dtype=float)
        if len(segment_points) < 2:
            continue
        centroid = segment_points[:, :2].mean(axis=0)
        normalized_centroid = (
            (centroid[0] - world_points[:, 0].min()) / max(float(np.ptp(world_points[:, 0])), 1e-6),
            (centroid[1] - world_points[:, 1].min()) / max(float(np.ptp(world_points[:, 1])), 1e-6),
        )
        habitat = _nearest_habitat(normalized_centroid, habitats, projected_habitats)
        lead = habitat.species_pressures[0]
        secondary = habitat.species_pressures[1]
        surface_area = float(
            segment.get("surface_area", max(float(np.ptp(segment_points[:, 0])) * float(np.ptp(segment_points[:, 1])), 1e-6))
        )
        density = _segment_density(segment_points, len(world_points))
        height_score = float(np.ptp(segment_points[:, 2]))
        raw_confidence = min(0.99, lead.vulnerability_score * 0.52 + density * 0.22 + height_score * 0.26)
        calibrated = calibrator.predict(
            raw_score=raw_confidence,
            habitat_prior=lead.vulnerability_score,
            segment_density=density,
            box_area_ratio=min(surface_area, 1.0),
        )
        adjusted_risk = min(1.0, habitat.risk_score * 0.72 + density * 0.18 + height_score * 0.1)
        projected_polygon = _normalize_polygon(segment_points, world_points)
        map_polygon = _segment_polygon(segment_points)
        world_polygon = _segment_world_polygon(segment_points)
        explanation = _explanation_for_segment(
            lead.common_name,
            adjusted_risk,
            raw_confidence,
            calibrated,
            lead.vulnerability_score,
            density,
            surface_area,
            segment["segment_kind"],
        )
        secondary_raw = min(0.97, secondary.vulnerability_score * 0.48 + density * 0.21 + 0.12)
        secondary_calibrated = calibrator.predict(
            raw_score=secondary_raw,
            habitat_prior=secondary.vulnerability_score,
            segment_density=density,
            box_area_ratio=min(surface_area, 1.0),
        )
        scan_cells.append(
            ScanCell(
                cell_id=f"{habitat.cell_id}-{segment['id']}",
                risk_score=round(adjusted_risk, 4),
                health_label=habitat.health_label if adjusted_risk < 0.68 else "fragile",
                habitat_type=habitat.habitat_type,
                projected_polygon=projected_polygon,
                canopy_height=round(float(segment_points[:, 2].max()), 4),
                lead_species=lead.common_name,
                detections=[
                    ScanDetection(
                        species_name=lead.common_name,
                        confidence=round(calibrated, 4),
                        risk_level=habitat.health_label if lead.vulnerability_score < 0.68 else "fragile",
                        note=f"Surface-aware segmentation matched this segment to {lead.common_name}.",
                        action_items=habitat.recommended_actions[:2],
                        raw_confidence=round(raw_confidence, 4),
                        calibrated_confidence=round(calibrated, 4),
                        habitat_prior=round(lead.vulnerability_score, 4),
                        model_source="EcoScan surface-aware segmenter",
                        explanation=explanation,
                        segment_id=segment["id"],
                    ),
                    ScanDetection(
                        species_name=secondary.common_name,
                        confidence=round(secondary_calibrated, 4),
                        risk_level=habitat.health_label if secondary.vulnerability_score < 0.68 else "fragile",
                        note=f"Secondary geometry cues also support {secondary.common_name}.",
                        action_items=habitat.recommended_actions[1:3] or habitat.recommended_actions[:1],
                        raw_confidence=round(secondary_raw, 4),
                        calibrated_confidence=round(secondary_calibrated, 4),
                        habitat_prior=round(secondary.vulnerability_score, 4),
                        model_source="EcoScan surface-aware segmenter",
                        explanation=_explanation_for_segment(
                            secondary.common_name,
                            adjusted_risk,
                            secondary_raw,
                            secondary_calibrated,
                            secondary.vulnerability_score,
                            density,
                            surface_area,
                            segment["segment_kind"],
                        ),
                        segment_id=segment["id"],
                    ),
                ],
                map_polygon=map_polygon,
                world_polygon=world_polygon,
                point_count=int(len(segment_points)),
                face_count=int(len(segment["faces"])) if segment.get("faces") is not None else 0,
                surface_area=round(surface_area, 4),
                segment_kind=str(segment["segment_kind"]),
                metadata={
                    "segment_id": segment["id"],
                    "source_epsg": source_epsg,
                    "aligned_to_map": world_points is not None,
                },
            )
        )

    if not scan_cells:
        raise ValueError("Unable to derive meaningful scan segments from the uploaded file")

    return {
        "scan_model": [asdict(cell) for cell in scan_cells],
        "scan_summary": {
            "filename": filename,
            "point_count": int(len(points)),
            "tile_count": len(scan_cells),
            "max_height": round(float(normalized_points[:, 2].max()), 4),
            "face_count": int(len(faces)) if faces is not None else 0,
            "source_epsg": source_epsg,
            "segmentation_mode": "mesh-surface" if faces is not None and len(faces) else "point-cluster",
        },
    }
