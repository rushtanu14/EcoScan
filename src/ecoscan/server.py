import json
from dataclasses import asdict
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

from .dataio import load_input_bundle
from .pipeline import build_habitat_model, build_scan_model, summarize_habitat_zones, summarize_species_catalog


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


def build_demo_payload(
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
        "study_area": map_data["study_area"],
        "landmarks": map_data["landmarks"],
        "sensors": [asdict(sensor) for sensor in sensors],
        "habitats": [asdict(habitat) for habitat in habitats],
        **extras,
    }


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
    try:
        server = ThreadingHTTPServer((host, port), EcoScanHandler)
    except OSError as e:
        # If the port is already in use, check whether an existing service
        # is responding on the same host:port. If so, assume the existing
        # EcoScan server should be reused and exit gracefully. Otherwise
        # re-raise the error so the caller can see the failure.
        import socket

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.settimeout(1.0)
            sock.connect((host, port))
            print(f"Detected existing server at http://{host}:{port}; not starting a new one.")
            return
        except Exception:
            raise
        finally:
            try:
                sock.close()
            except Exception:
                pass

    print(f"EcoScan server running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
