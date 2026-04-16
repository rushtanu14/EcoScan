from dataclasses import asdict
from pathlib import Path
from typing import Optional

from .dataio import load_input_bundle
from .pipeline import build_habitat_model, summarize_habitat_zones

try:
    from fastapi import FastAPI
    from fastapi.responses import FileResponse
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "FastAPI is not installed. Install optional dependencies with: pip install -e '.[api]'"
    ) from exc


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="EcoScan API", version="0.2.0")


def _demo_payload(
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> dict[str, object]:
    cells, sensors, map_data = load_input_bundle(
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )
    habitats = build_habitat_model(cells, sensors, cell_polygons=map_data["cell_polygons"])
    return {
        "rows": len({cell.centroid[1] for cell in cells}),
        "cols": len({cell.centroid[0] for cell in cells}),
        "overview": summarize_habitat_zones(habitats),
        "study_area": map_data["study_area"],
        "landmarks": map_data["landmarks"],
        "sensors": [asdict(sensor) for sensor in sensors],
        "habitats": [asdict(habitat) for habitat in habitats],
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/styles.css")
def styles() -> FileResponse:
    return FileResponse(STATIC_DIR / "styles.css")


@app.get("/app.js")
def script() -> FileResponse:
    return FileResponse(STATIC_DIR / "app.js")


@app.get("/assets/{asset_path:path}")
def assets(asset_path: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "assets" / asset_path)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/demo-biodiversity")
def demo_biodiversity(
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> dict[str, object]:
    return _demo_payload(
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )
