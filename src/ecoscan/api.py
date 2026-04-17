from dataclasses import asdict
from pathlib import Path
from typing import Optional

from .dataio import load_input_bundle
from .jobs import attach_report, create_job, get_job
from .pipeline import build_habitat_model, build_scan_model, summarize_habitat_zones, summarize_species_catalog
from .reports import create_report
from .server import analyze_visual_payload

try:
    from fastapi import Body, FastAPI, HTTPException
    from fastapi.responses import FileResponse, HTMLResponse
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
    extras = {
        key: value
        for key, value in map_data.items()
        if key not in {"study_area", "landmarks", "cell_polygons"}
    }
    return {
        "rows": len({cell.centroid[1] for cell in cells}),
        "cols": len({cell.centroid[0] for cell in cells}),
        "overview": summarize_habitat_zones(habitats),
        "species_catalog": summarize_species_catalog(habitats),
        "scan_model": [asdict(cell) for cell in build_scan_model(habitats, map_data["study_area"]["bounds"])],
        "scan_summary": {
            "filename": "demo-generated-scan",
            "point_count": 0,
            "tile_count": len(habitats),
            "max_height": 0.0,
            "face_count": 0,
            "source_epsg": None,
            "segmentation_mode": "demo-grid",
        },
        "detector_summary": {
            "mode": "idle",
            "label": "No photo analysis yet",
            "model_name": "Photo detector idle",
            "target_taxa": [],
            "message": "Upload photos to see which detector path is used.",
        },
        "study_area": map_data["study_area"],
        "landmarks": map_data["landmarks"],
        "sensors": [asdict(sensor) for sensor in sensors],
        "habitats": [asdict(habitat) for habitat in habitats],
        **extras,
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


@app.post("/api/analyze-visual")
def analyze_visual(
    payload: dict[str, object] = Body(default_factory=dict),
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> dict[str, object]:
    return analyze_visual_payload(
        payload,
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )


@app.post("/api/jobs/analyze", status_code=202)
def create_analysis_job(
    payload: dict[str, object] = Body(default_factory=dict),
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> dict[str, object]:
    job = create_job(
        payload,
        lambda submitted, progress_callback=None: analyze_visual_payload(
            submitted,
            rows=rows,
            cols=cols,
            data_dir=data_dir,
            cells_file=cells_file,
            sensors_file=sensors_file,
            map_file=map_file,
            progress_callback=progress_callback,
        ),
    )
    return {"job_id": job.job_id, "status": job.status, "progress": job.progress, "stage": job.stage, "message": job.message}


@app.get("/api/jobs/{job_id}")
def get_analysis_job(job_id: str) -> dict[str, object]:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "stage": job.stage,
        "message": job.message,
        "result": job.result,
        "error": job.error,
        "report": job.report,
    }


@app.post("/api/jobs/report")
def export_report(payload: dict[str, object] = Body(default_factory=dict)) -> dict[str, object]:
    job_id = str(payload.get("job_id", ""))
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail="Job is not complete yet")
    report = create_report(job_id, job.result)
    attach_report(job_id, report)
    return report


@app.get("/reports/{report_id}", response_class=HTMLResponse)
def get_report(report_id: str) -> str:
    report_path = Path("/tmp/ecoscan-reports") / report_id
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return report_path.read_text(encoding="utf-8")
