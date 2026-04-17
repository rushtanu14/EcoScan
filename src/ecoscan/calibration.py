import json
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence


BASE_DIR = Path(__file__).resolve().parents[2]
VALIDATION_PATH = BASE_DIR / "data" / "validation" / "species_detector_validation.json"


class ScoreCalibrator:
    def __init__(self) -> None:
        self._model = None
        self._fallback_bias = 0.0

    def fit(self, samples: Sequence[dict]) -> None:
        try:
            from sklearn.linear_model import LogisticRegression
        except Exception:
            self._model = None
            return

        if not samples:
            self._model = None
            return

        features = [
            [
                float(sample["raw_score"]),
                float(sample.get("habitat_prior", 0.0)),
                float(sample.get("box_area_ratio", 0.0)),
                float(sample.get("segment_density", 0.0)),
            ]
            for sample in samples
        ]
        labels = [int(sample["label"]) for sample in samples]
        model = LogisticRegression(max_iter=500)
        model.fit(features, labels)
        self._model = model
        self._fallback_bias = sum(labels) / max(len(labels), 1)

    def predict(self, raw_score: float, habitat_prior: float = 0.0, box_area_ratio: float = 0.0, segment_density: float = 0.0) -> float:
        if self._model is None:
            blended = raw_score * 0.72 + habitat_prior * 0.2 + box_area_ratio * 0.08
            if self._fallback_bias:
                blended = blended * 0.7 + self._fallback_bias * 0.3
            return max(0.01, min(blended, 0.99))
        probability = self._model.predict_proba([[raw_score, habitat_prior, box_area_ratio, segment_density]])[0][1]
        return float(max(0.01, min(probability, 0.99)))


def _load_validation_samples() -> Iterable[dict]:
    if not VALIDATION_PATH.exists():
        return []
    with VALIDATION_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload.get("samples", [])


@lru_cache(maxsize=1)
def get_score_calibrator() -> ScoreCalibrator:
    calibrator = ScoreCalibrator()
    calibrator.fit(list(_load_validation_samples()))
    return calibrator
