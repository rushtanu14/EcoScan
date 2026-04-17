import base64
import io
import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageFilter

from .calibration import get_score_calibrator
from .models import HabitatZone
from .pipeline import species_profile


DEFAULT_DETECTOR_MODEL = "google/owlvit-base-patch32"
FINE_TUNED_MANIFEST_NAME = "ecoscan-detector.json"
VISUAL_FEATURE_KEYS = ("warmth", "greenness", "blueness", "darkness", "saturation", "edge_density")
MODEL_CACHE_DIR = Path.home() / ".cache" / "huggingface" / "hub" / "models--google--owlvit-base-patch32"


def _decode_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        raise ValueError("Photo data must be a data URL")
    return base64.b64decode(data_url.split(",", 1)[1])


def _load_image(photo: Dict[str, str]) -> Image.Image:
    blob = _decode_data_url(photo["data_url"])
    return Image.open(io.BytesIO(blob)).convert("RGB")


def _image_features(image: Image.Image) -> Dict[str, float]:
    resized = image.resize((128, 128))
    pixels = list(resized.getdata())
    total = max(len(pixels), 1)
    warmth = 0.0
    greenness = 0.0
    blueness = 0.0
    darkness = 0.0
    saturation = 0.0

    for red, green, blue in pixels:
        r = red / 255.0
        g = green / 255.0
        b = blue / 255.0
        warmth += max(r - max(g, b), 0.0)
        greenness += max(g - max(r, b), 0.0)
        blueness += max(b - max(r, g), 0.0)
        darkness += 1.0 - ((r + g + b) / 3.0)
        saturation += max(r, g, b) - min(r, g, b)

    edge_image = resized.convert("L").filter(ImageFilter.FIND_EDGES)
    edge_pixels = list(edge_image.getdata())
    edge_density = sum(1 for value in edge_pixels if value > 48) / max(len(edge_pixels), 1)

    return {
        "warmth": warmth / total,
        "greenness": greenness / total,
        "blueness": blueness / total,
        "darkness": darkness / total,
        "saturation": saturation / total,
        "edge_density": edge_density,
    }


def _tile_scores(image: Image.Image, columns: int = 4, rows: int = 3) -> List[Tuple[float, Tuple[int, int, int, int]]]:
    width, height = image.size
    tile_width = max(width // columns, 1)
    tile_height = max(height // rows, 1)
    edges = image.convert("L").filter(ImageFilter.FIND_EDGES)
    scored_tiles: List[Tuple[float, Tuple[int, int, int, int]]] = []

    for row in range(rows):
        for column in range(columns):
            left = column * tile_width
            top = row * tile_height
            right = width if column == columns - 1 else (column + 1) * tile_width
            bottom = height if row == rows - 1 else (row + 1) * tile_height
            crop = image.crop((left, top, right, bottom))
            crop_features = _image_features(crop)
            edge_crop = edges.crop((left, top, right, bottom))
            edge_values = list(edge_crop.getdata())
            edge_strength = sum(edge_values) / max(len(edge_values), 1) / 255.0
            score = crop_features["saturation"] * 0.45 + crop_features["edge_density"] * 0.35 + edge_strength * 0.2
            scored_tiles.append((score, (left, top, right, bottom)))

    return sorted(scored_tiles, key=lambda item: item[0], reverse=True)


def _fallback_boxes(image: Image.Image) -> List[Dict[str, float]]:
    width, height = image.size
    boxes: List[Dict[str, float]] = []
    for score, (left, top, right, bottom) in _tile_scores(image)[:2]:
        if score <= 0.08:
            continue
        boxes.append(
            {
                "left": round((left / width) * 100.0, 2),
                "top": round((top / height) * 100.0, 2),
                "width": round(((right - left) / width) * 100.0, 2),
                "height": round(((bottom - top) / height) * 100.0, 2),
            }
        )
    return boxes or [{"left": 18.0, "top": 18.0, "width": 48.0, "height": 42.0}]


def _normalized_habitat_scores(habitats: Sequence[HabitatZone]) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    for habitat in habitats:
        for pressure in habitat.species_pressures:
            scores[pressure.common_name] = max(scores.get(pressure.common_name, 0.0), pressure.vulnerability_score)
    return scores


def _normalize_label(label: str) -> str:
    return " ".join(str(label).strip().lower().replace("_", " ").split())


@lru_cache(maxsize=1)
def _tracked_species_names() -> Tuple[str, ...]:
    return tuple(species["common_name"] for species in _species_catalog())


def _allow_model_download() -> bool:
    return os.environ.get("ECOSCAN_ALLOW_MODEL_DOWNLOAD") == "1"


def _fine_tuned_model_ref() -> str:
    return os.environ.get("ECOSCAN_FINE_TUNED_MODEL", "").strip()


def _fine_tuned_manifest_ref(model_ref: str) -> str:
    manifest_ref = os.environ.get("ECOSCAN_FINE_TUNED_MANIFEST", "").strip()
    if manifest_ref:
        return manifest_ref
    if not model_ref:
        return ""
    candidate = Path(model_ref) / FINE_TUNED_MANIFEST_NAME
    return str(candidate) if candidate.exists() else ""


def _load_detector_manifest(manifest_ref: str) -> Dict[str, object]:
    if not manifest_ref:
        return {}
    manifest_path = Path(manifest_ref)
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _canonical_species_label(label: str, extra_map: Optional[Dict[str, str]] = None) -> str:
    normalized = _normalize_label(label)
    if extra_map and normalized in extra_map:
        return extra_map[normalized]
    return _candidate_label_map().get(label, _candidate_label_map().get(normalized, label))


def _fine_tuned_label_map(manifest: Dict[str, object]) -> Dict[str, str]:
    mapping = {_normalize_label(label): canonical for label, canonical in _candidate_label_map().items()}

    manifest_map = manifest.get("label_map", {})
    if isinstance(manifest_map, dict):
        for label, canonical in manifest_map.items():
            mapping[_normalize_label(label)] = str(canonical)

    for taxon in manifest.get("target_taxa", []):
        if not isinstance(taxon, dict):
            continue
        canonical = str(taxon.get("species_name") or taxon.get("common_name") or "").strip()
        if not canonical:
            continue
        mapping[_normalize_label(canonical)] = canonical
        for alias in taxon.get("aliases", []):
            mapping[_normalize_label(alias)] = canonical
    return mapping


def _target_taxa_names(manifest: Dict[str, object]) -> List[str]:
    names: List[str] = []
    for taxon in manifest.get("target_taxa", []):
        if not isinstance(taxon, dict):
            continue
        canonical = str(taxon.get("species_name") or taxon.get("common_name") or "").strip()
        if canonical:
            names.append(canonical)
    return names


@lru_cache(maxsize=2)
def _zero_shot_detector_backend(allow_download: bool) -> Dict[str, object]:
    from transformers import pipeline

    model_ref = DEFAULT_DETECTOR_MODEL
    if not allow_download:
        snapshot_dirs = list((MODEL_CACHE_DIR / "snapshots").glob("*")) if (MODEL_CACHE_DIR / "snapshots").exists() else []
        usable_snapshot = next(
            (
                snapshot
                for snapshot in snapshot_dirs
                if (snapshot / "config.json").exists() and any(
                    (snapshot / candidate).exists() for candidate in ("model.safetensors", "pytorch_model.bin")
                )
            ),
            None,
        )
        if usable_snapshot is None:
            raise RuntimeError("Pretrained detector snapshot is not available locally")
        model_ref = str(usable_snapshot)
    detector = pipeline(
        model=model_ref,
        task="zero-shot-object-detection",
        local_files_only=not allow_download,
    )

    def _predict(image: Image.Image) -> List[Dict[str, object]]:
        return detector(image, candidate_labels=_candidate_labels())

    return {
        "kind": "zero-shot",
        "model_name": "OWL-ViT zero-shot object detector",
        "target_taxa": list(_tracked_species_names()),
        "predict": _predict,
    }


def _candidate_labels() -> List[str]:
    return list(_candidate_label_map().keys())


@lru_cache(maxsize=1)
def _candidate_label_map() -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for species in _species_catalog():
        mapping[species["common_name"]] = species["common_name"]
        mapping[_normalize_label(species["common_name"])] = species["common_name"]
        for alias in species.get("aliases", []):
            mapping[alias] = species["common_name"]
            mapping[_normalize_label(alias)] = species["common_name"]
    return mapping


@lru_cache(maxsize=1)
def _species_catalog() -> Tuple[Dict[str, object], ...]:
    from .pipeline import SPECIES_LIBRARY

    return tuple(SPECIES_LIBRARY)


@lru_cache(maxsize=4)
def _fine_tuned_detector_backend(model_ref: str, manifest_ref: str, allow_download: bool) -> Dict[str, object]:
    import torch
    from transformers import AutoImageProcessor, AutoModelForObjectDetection

    local_files_only = not allow_download
    processor = AutoImageProcessor.from_pretrained(model_ref, local_files_only=local_files_only)
    model = AutoModelForObjectDetection.from_pretrained(model_ref, local_files_only=local_files_only)
    model.eval()
    manifest = _load_detector_manifest(manifest_ref)
    label_map = _fine_tuned_label_map(manifest)
    score_threshold = float(os.environ.get("ECOSCAN_FINE_TUNED_SCORE_THRESHOLD", "0.2"))
    id2label = {
        int(index): str(label)
        for index, label in getattr(model.config, "id2label", {}).items()
    }

    def _predict(image: Image.Image) -> List[Dict[str, object]]:
        inputs = processor(images=image, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
        post_process = getattr(processor, "post_process_object_detection", None)
        if post_process is None:
            raise RuntimeError("Fine-tuned detector processor does not support object-detection post processing")
        target_sizes = torch.tensor([[image.height, image.width]])
        processed = post_process(outputs, threshold=score_threshold, target_sizes=target_sizes)[0]
        labels = processed.get("labels", [])
        scores = processed.get("scores", [])
        boxes = processed.get("boxes", [])
        predictions: List[Dict[str, object]] = []
        for label_id, score, box in zip(labels, scores, boxes):
            source_label = id2label.get(int(label_id), str(label_id))
            mapped_label = _canonical_species_label(source_label, label_map)
            xmin, ymin, xmax, ymax = [float(value) for value in box.tolist()]
            predictions.append(
                {
                    "label": mapped_label,
                    "source_label": source_label,
                    "score": float(score),
                    "box": {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
                }
            )
        return predictions

    return {
        "kind": "fine-tuned",
        "model_name": str(manifest.get("display_name") or manifest.get("model_name") or Path(model_ref).name or model_ref),
        "target_taxa": _target_taxa_names(manifest) or list(_tracked_species_names()),
        "label_map": label_map,
        "predict": _predict,
    }


def _active_detector_backend() -> Optional[Dict[str, object]]:
    if os.environ.get("ECOSCAN_DISABLE_MODEL") == "1":
        return None

    allow_download = _allow_model_download()
    fine_tuned_ref = _fine_tuned_model_ref()
    if fine_tuned_ref:
        try:
            return _fine_tuned_detector_backend(fine_tuned_ref, _fine_tuned_manifest_ref(fine_tuned_ref), allow_download)
        except Exception:
            pass

    try:
        return _zero_shot_detector_backend(allow_download)
    except Exception:
        return None


def _run_detector(image: Image.Image) -> Tuple[List[Dict[str, object]], Dict[str, object]]:
    backend = _active_detector_backend()
    if not backend:
        return [], {"kind": "fallback", "model_name": "EcoScan fallback visual ranker", "target_taxa": []}
    try:
        predictions = backend["predict"](image)
        return predictions, {
            "kind": str(backend.get("kind", "model")),
            "model_name": str(backend.get("model_name", "EcoScan detector")),
            "target_taxa": list(backend.get("target_taxa", [])),
            "label_map": dict(backend.get("label_map", {})),
        }
    except Exception:
        return [], {"kind": "fallback", "model_name": "EcoScan fallback visual ranker", "target_taxa": []}


def _box_area_ratio(box: Dict[str, float], width: int, height: int) -> float:
    return max(((box["xmax"] - box["xmin"]) * (box["ymax"] - box["ymin"])) / max(width * height, 1), 0.0)


def _normalize_prediction_box(box: Dict[str, float], width: int, height: int) -> Dict[str, float]:
    return {
        "left": round((box["xmin"] / width) * 100.0, 2),
        "top": round((box["ymin"] / height) * 100.0, 2),
        "width": round(((box["xmax"] - box["xmin"]) / width) * 100.0, 2),
        "height": round(((box["ymax"] - box["ymin"]) / height) * 100.0, 2),
    }


def _fallback_rank(features: Dict[str, float], habitat_scores: Dict[str, float]) -> List[Tuple[float, str]]:
    ranked: List[Tuple[float, str]] = []
    for profile in _species_catalog():
        signature = {
            "warmth": 0.2 + habitat_scores.get(profile["common_name"], 0.0) * 0.3,
            "greenness": 0.2 + (1.0 if profile["kingdom"] == "plant" else 0.6) * 0.4,
            "blueness": 0.12,
            "darkness": 0.3 + (0.18 if profile["kingdom"] == "animal" else 0.0),
            "saturation": 0.35 + habitat_scores.get(profile["common_name"], 0.0) * 0.35,
            "edge_density": 0.25 + (0.2 if profile["kingdom"] == "animal" else 0.08),
        }
        distance = math.sqrt(sum((features[key] - signature[key]) ** 2 for key in VISUAL_FEATURE_KEYS))
        similarity = max(0.0, 1.0 - distance / 1.75)
        blended = similarity * 0.74 + habitat_scores.get(profile["common_name"], 0.0) * 0.26
        ranked.append((blended, profile["common_name"]))
    return sorted(ranked, reverse=True)


def _prediction_map(
    predictions: Sequence[Dict[str, object]],
    width: int,
    height: int,
    label_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Dict[str, object]]:
    grouped: Dict[str, Dict[str, object]] = {}
    for prediction in predictions:
        label = _canonical_species_label(str(prediction["label"]), label_map)
        box = prediction["box"]
        area_ratio = _box_area_ratio(box, width, height)
        entry = grouped.get(label)
        if entry is None or float(prediction["score"]) > float(entry["raw_score"]):
            grouped[label] = {
                "label": label,
                "source_label": str(prediction.get("source_label", prediction["label"])),
                "raw_score": float(prediction["score"]),
                "box": box,
                "box_area_ratio": area_ratio,
                "normalized_box": _normalize_prediction_box(box, width, height),
            }
    return grouped


def analyze_photos(
    photos: Sequence[Dict[str, str]],
    habitats: Sequence[HabitatZone],
    active_cell_id: str = "",
) -> List[Dict[str, object]]:
    habitat_scores = _normalized_habitat_scores(habitats)
    calibrator = get_score_calibrator()
    habitat_lookup = {habitat.cell_id: habitat for habitat in habitats}
    focused_habitat = habitat_lookup.get(active_cell_id) if active_cell_id else None
    results: List[Dict[str, object]] = []

    for index, photo in enumerate(photos):
        image = _load_image(photo)
        width, height = image.size
        features = _image_features(image)
        predictions, detector_meta = _run_detector(image)
        grouped_predictions = _prediction_map(predictions, width, height, detector_meta.get("label_map"))

        ranked: List[Tuple[float, float, float, str, Dict[str, object]]] = []
        if grouped_predictions:
            for species_name in _tracked_species_names():
                prediction = grouped_predictions.get(species_name)
                raw_score = float(prediction["raw_score"]) if prediction else 0.0
                habitat_prior = habitat_scores.get(species_name, 0.25)
                if focused_habitat:
                    habitat_prior = max(
                        habitat_prior,
                        next(
                            (
                                pressure.vulnerability_score
                                for pressure in focused_habitat.species_pressures
                                if pressure.common_name == species_name
                            ),
                            habitat_prior,
                        ),
                    )
                area_ratio = float(prediction["box_area_ratio"]) if prediction else 0.0
                calibrated = calibrator.predict(raw_score=raw_score, habitat_prior=habitat_prior, box_area_ratio=area_ratio)
                ranked.append((calibrated, raw_score, habitat_prior, species_name, prediction or {}))
        else:
            fallback_ranked = _fallback_rank(features, habitat_scores)
            ranked = [
                (
                    calibrator.predict(raw_score=raw_score, habitat_prior=habitat_scores.get(species_name, 0.25)),
                    raw_score,
                    habitat_scores.get(species_name, 0.25),
                    species_name,
                    {},
                )
                for raw_score, species_name in fallback_ranked
            ]

        ranked.sort(key=lambda item: item[0], reverse=True)
        calibrated_confidence, raw_confidence, habitat_prior, lead_species, prediction = ranked[0]
        habitat = (
            focused_habitat
            or next(
                (
                    habitat
                    for habitat in habitats
                    if habitat.species_pressures[0].common_name == lead_species
                    or any(pressure.common_name == lead_species for pressure in habitat.species_pressures[:3])
                ),
                habitats[min(index, len(habitats) - 1)],
            )
        )
        lead_pressure = next(
            (pressure for pressure in habitat.species_pressures if pressure.common_name == lead_species),
            habitat.species_pressures[0],
        )
        explanation = {
            "visual_features": {key: round(features[key], 4) for key in VISUAL_FEATURE_KEYS},
            "detector_score": round(raw_confidence, 4),
            "calibrated_score": round(calibrated_confidence, 4),
            "habitat_prior": round(habitat_prior, 4),
            "box_area_ratio": round(float(prediction.get("box_area_ratio", 0.0)), 4),
            "model": str(detector_meta.get("model_name", "EcoScan fallback visual ranker")) if predictions else "EcoScan fallback visual ranker",
            "detector_family": str(detector_meta.get("kind", "fallback")),
            "matched_queries": [
                lead_species,
                lead_pressure.scientific_name,
                *species_profile(lead_species).get("aliases", [])[:2],
            ],
            "target_taxa": list(detector_meta.get("target_taxa", []))[:8],
        }
        if prediction.get("source_label"):
            explanation["source_label"] = str(prediction["source_label"])

        results.append(
            {
                "id": f"{photo['name']}-{index}",
                "name": photo["name"],
                "species_name": lead_species,
                "scientific_name": lead_pressure.scientific_name,
                "cell_id": habitat.cell_id,
                "preview_url": photo["data_url"],
                "confidence": round(calibrated_confidence, 4),
                "raw_confidence": round(raw_confidence, 4),
                "calibrated_confidence": round(calibrated_confidence, 4),
                "habitat_prior": round(habitat_prior, 4),
                "boxes": [prediction["normalized_box"]] if prediction else _fallback_boxes(image),
                "note": habitat.habitat_story,
                "action_items": habitat.recommended_actions,
                "explanation": explanation,
                "top_matches": [
                    {
                        "species_name": species_name,
                        "confidence": round(calibrated, 4),
                        "raw_confidence": round(raw, 4),
                        "habitat_prior": round(prior, 4),
                    }
                    for calibrated, raw, prior, species_name, _prediction in ranked[:3]
                ],
                "features": {key: round(value, 4) for key, value in features.items()},
                "model_source": explanation["model"],
            }
        )

    return results
