import json
import os
from dataclasses import asdict
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import parse_qs, urlparse

from .dataio import load_input_bundle
from .jobs import attach_report, create_job, get_job
from .pipeline import build_habitat_model, build_scan_model, summarize_habitat_zones, summarize_species_catalog
from .reports import REPORT_DIR, create_report
from .scanio import ingest_scan
from .vision import analyze_photos


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


def _default_detector_summary() -> dict[str, object]:
    fine_tuned_model = os.environ.get("ECOSCAN_FINE_TUNED_MODEL", "").strip()
    if fine_tuned_model:
        return {
            "mode": "fine-tuned-configured",
            "label": "Fine-tuned checkpoint configured",
            "model_name": Path(fine_tuned_model).name,
            "target_taxa": [],
            "message": "A fine-tuned checkpoint is configured and will be used when photo analysis runs successfully.",
        }
    return {
        "mode": "idle",
        "label": "No photo analysis yet",
        "model_name": "Photo detector idle",
        "target_taxa": [],
        "message": "Upload photos to see whether EcoScan used the fine-tuned detector, zero-shot fallback, or heuristic fallback.",
    }


def _detector_summary_from_evidence(uploaded_evidence: list[dict[str, object]]) -> dict[str, object]:
    if not uploaded_evidence:
        return _default_detector_summary()

    explanation = uploaded_evidence[0].get("explanation", {})
    family = str(explanation.get("detector_family", "fallback"))
    model_name = str(explanation.get("model") or uploaded_evidence[0].get("model_source") or "EcoScan detector")
    target_taxa = list(explanation.get("target_taxa", []))
    if family == "fine-tuned":
        message = "This analysis used your fine-tuned target-taxa checkpoint for localized species detection."
    elif family == "zero-shot":
        message = "This analysis used the zero-shot fallback detector because a fine-tuned checkpoint was not active for this run."
    else:
        message = "This analysis fell back to the calibrated heuristic ranker because localized model detections were unavailable."
    return {
        "mode": family,
        "label": model_name,
        "model_name": model_name,
        "target_taxa": target_taxa,
        "message": message,
    }


def build_demo_payload(
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> dict[str, object]:
    cells, sensors, map_data, habitats = build_loaded_state(
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )
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
        "detector_summary": _default_detector_summary(),
        "study_area": map_data["study_area"],
        "landmarks": map_data["landmarks"],
        "sensors": [asdict(sensor) for sensor in sensors],
        "habitats": [asdict(habitat) for habitat in habitats],
        **extras,
    }


def build_loaded_state(
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
):
    cells, sensors, map_data = load_input_bundle(
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )
    habitats = build_habitat_model(cells, sensors, cell_polygons=map_data["cell_polygons"])
    return cells, sensors, map_data, habitats


def analyze_visual_payload(
    payload: dict[str, object],
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
    progress_callback: Optional[Callable[[int, str, str], None]] = None,
) -> dict[str, object]:
    if progress_callback:
        progress_callback(10, "loading-context", "Loading habitat and map context")
    _, _, map_data, habitats = build_loaded_state(
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )
    photos = payload.get("photos", [])
    if not isinstance(photos, list):
        raise ValueError("'photos' must be a list")
    active_cell_id = str(payload.get("active_cell_id", "") or "")
    if progress_callback:
        progress_callback(25, "analyzing-photos", f"Analyzing {len(photos)} uploaded photo(s)")
    uploaded_evidence = analyze_photos(photos, habitats, active_cell_id=active_cell_id) if photos else []
    detector_summary = _detector_summary_from_evidence(uploaded_evidence)

    scan_payload = payload.get("scan_file")
    if scan_payload:
        if not isinstance(scan_payload, dict):
            raise ValueError("'scan_file' must be an object")
        if progress_callback:
            progress_callback(65, "analyzing-scan", f"Parsing and segmenting {scan_payload.get('name', 'uploaded scan')}")
        scan_result = ingest_scan(
            str(scan_payload.get("name", "scan.xyz")),
            str(scan_payload.get("content", "")),
            habitats,
            metadata={
                "encoding": scan_payload.get("encoding", ""),
                "source_epsg": scan_payload.get("source_epsg"),
                "study_area_bounds": map_data["study_area"]["bounds"],
            },
        )
    else:
        scan_result = {
            "scan_model": [asdict(cell) for cell in build_scan_model(habitats, map_data["study_area"]["bounds"])],
            "scan_summary": {"filename": "", "point_count": 0, "tile_count": 0, "max_height": 0.0},
        }

    if progress_callback:
        progress_callback(95, "assembling-results", "Assembling detections, scan overlays, and action items")
    focus_species = (
        uploaded_evidence[0]["species_name"]
        if uploaded_evidence
        else (scan_result["scan_model"][0]["lead_species"] if scan_result["scan_model"] else payload.get("active_species_name", ""))
    )
    return {
        "uploaded_evidence": uploaded_evidence,
        "scan_model": scan_result["scan_model"],
        "scan_summary": scan_result["scan_summary"],
        "focus_species": focus_species,
        "detector_summary": detector_summary,
    }


def _build_job_runner(
    rows: int,
    cols: int,
    data_dir: Optional[str],
    cells_file: Optional[str],
    sensors_file: Optional[str],
    map_file: Optional[str],
):
    def _runner(payload: dict[str, object], progress_callback: Optional[Callable[[int, str, str], None]] = None) -> dict[str, object]:
        return analyze_visual_payload(
            payload,
            rows=rows,
            cols=cols,
            data_dir=data_dir,
            cells_file=cells_file,
            sensors_file=sensors_file,
            map_file=map_file,
            progress_callback=progress_callback,
        )

    return _runner


class EcoScanHandler(SimpleHTTPRequestHandler):
    rows = 6
    cols = 6
    data_dir: Optional[str] = None
    cells_file: Optional[str] = None
    sensors_file: Optional[str] = None
    map_file: Optional[str] = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path.startswith("/reports/"):
            report_name = parsed.path.split("/reports/", 1)[1]
            report_path = REPORT_DIR / report_name
            if not report_path.exists():
                self._write_json({"error": "Report not found"}, status=HTTPStatus.NOT_FOUND)
                return
            self.send_response(HTTPStatus.OK)
            body = report_path.read_bytes()
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path.startswith("/api/jobs/"):
            job_id = parsed.path.split("/api/jobs/", 1)[1]
            job = get_job(job_id)
            if not job:
                self._write_json({"error": "Job not found"}, status=HTTPStatus.NOT_FOUND)
                return
            self._write_json(
                {
                    "job_id": job.job_id,
                    "status": job.status,
                    "progress": job.progress,
                    "stage": job.stage,
                    "message": job.message,
                    "result": job.result,
                    "error": job.error,
                    "report": job.report,
                }
            )
            return

        if parsed.path == "/health":
            self._write_json({"status": "ok"})
            return

        if parsed.path == "/api/demo-biodiversity":
            params = parse_qs(parsed.query)
            rows = int(params.get("rows", [str(self.rows)])[0])
            cols = int(params.get("cols", [str(self.cols)])[0])
            data_dir = params.get("data_dir", [self.data_dir])[0]
            cells_file = params.get("cells_file", [self.cells_file])[0]
            sensors_file = params.get("sensors_file", [self.sensors_file])[0]
            map_file = params.get("map_file", [self.map_file])[0]
            self._write_json(
                build_demo_payload(
                    rows=rows,
                    cols=cols,
                    data_dir=data_dir,
                    cells_file=cells_file,
                    sensors_file=sensors_file,
                    map_file=map_file,
                )
            )
            return

        if parsed.path == "/":
            self.path = "/index.html"
        elif parsed.path.startswith("/static/"):
            self.path = parsed.path.removeprefix("/static")

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in {"/api/analyze-visual", "/api/jobs/analyze", "/api/jobs/report"}:
            self._write_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
            if parsed.path == "/api/analyze-visual":
                response = analyze_visual_payload(
                    payload,
                    rows=self.rows,
                    cols=self.cols,
                    data_dir=self.data_dir,
                    cells_file=self.cells_file,
                    sensors_file=self.sensors_file,
                    map_file=self.map_file,
                )
                self._write_json(response)
                return

            if parsed.path == "/api/jobs/analyze":
                job = create_job(
                    payload,
                    _build_job_runner(
                        self.rows,
                        self.cols,
                        self.data_dir,
                        self.cells_file,
                        self.sensors_file,
                        self.map_file,
                    ),
                )
                self._write_json(
                    {"job_id": job.job_id, "status": job.status, "progress": job.progress, "stage": job.stage, "message": job.message},
                    status=HTTPStatus.ACCEPTED,
                )
                return

            job_id = str(payload.get("job_id", ""))
            job = get_job(job_id)
            if not job:
                self._write_json({"error": "Job not found"}, status=HTTPStatus.NOT_FOUND)
                return
            if job.status != "completed":
                self._write_json({"error": "Job is not complete yet"}, status=HTTPStatus.CONFLICT)
                return
            report = create_report(job_id, job.result)
            attach_report(job_id, report)
            self._write_json(report)
        except json.JSONDecodeError:
            self._write_json({"error": "Request body must be valid JSON"}, status=HTTPStatus.BAD_REQUEST)
        except ValueError as exc:
            self._write_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def log_message(self, format: str, *args) -> None:
        return

    def _write_json(self, payload: dict[str, object], status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_dev_server(
    host: str = "127.0.0.1",
    port: int = 8000,
    rows: int = 6,
    cols: int = 6,
    data_dir: Optional[str] = None,
    cells_file: Optional[str] = None,
    sensors_file: Optional[str] = None,
    map_file: Optional[str] = None,
) -> None:
    EcoScanHandler.rows = rows
    EcoScanHandler.cols = cols
    EcoScanHandler.data_dir = data_dir
    EcoScanHandler.cells_file = cells_file
    EcoScanHandler.sensors_file = sensors_file
    EcoScanHandler.map_file = map_file
    server = ThreadingHTTPServer((host, port), EcoScanHandler)
    print(f"EcoScan server running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
