import argparse
import json
from dataclasses import asdict
from typing import Optional

from .dataio import load_input_bundle
from .pipeline import build_habitat_model, summarize_habitat_zones, summarize_species_catalog
from .server import run_dev_server


def _demo_command(
    rows: int,
    cols: int,
    data_dir: Optional[str],
    cells_file: Optional[str],
    sensors_file: Optional[str],
    map_file: Optional[str],
) -> int:
    cells, sensors, map_data = load_input_bundle(
        rows=rows,
        cols=cols,
        data_dir=data_dir,
        cells_file=cells_file,
        sensors_file=sensors_file,
        map_file=map_file,
    )
    habitats = build_habitat_model(cells, sensors, cell_polygons=map_data["cell_polygons"])
    inferred_rows = len({cell.centroid[1] for cell in cells})
    inferred_cols = len({cell.centroid[0] for cell in cells})

    payload = {
        "rows": inferred_rows,
        "cols": inferred_cols,
        "habitat_count": len(habitats),
        "overview": summarize_habitat_zones(habitats),
        "species_catalog": summarize_species_catalog(habitats),
        "study_area": map_data["study_area"],
        "most_fragile_habitat": asdict(habitats[0]),
        "habitats": [asdict(zone) for zone in habitats[:10]],
        "sensor_profiles": map_data.get("sensor_profiles", []),
        "system_snapshot": map_data.get("system_snapshot", {}),
        "data_sources": map_data.get("data_sources", []),
    }
    print(json.dumps(payload, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="EcoScan biodiversity health toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    demo_parser = subparsers.add_parser("demo", help="Run the biodiversity habitat-health demo")
    demo_parser.add_argument("--rows", type=int, default=6)
    demo_parser.add_argument("--cols", type=int, default=6)
    demo_parser.add_argument("--data-dir")
    demo_parser.add_argument("--cells-file")
    demo_parser.add_argument("--sensors-file")
    demo_parser.add_argument("--map-file")

    serve_parser = subparsers.add_parser("serve", help="Run the full biodiversity dashboard locally")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)
    serve_parser.add_argument("--rows", type=int, default=6)
    serve_parser.add_argument("--cols", type=int, default=6)
    serve_parser.add_argument("--data-dir")
    serve_parser.add_argument("--cells-file")
    serve_parser.add_argument("--sensors-file")
    serve_parser.add_argument("--map-file")

    args = parser.parse_args()
    if args.command == "demo":
        return _demo_command(
            rows=args.rows,
            cols=args.cols,
            data_dir=args.data_dir,
            cells_file=args.cells_file,
            sensors_file=args.sensors_file,
            map_file=args.map_file,
        )
    if args.command == "serve":
        run_dev_server(
            host=args.host,
            port=args.port,
            rows=args.rows,
            cols=args.cols,
            data_dir=args.data_dir,
            cells_file=args.cells_file,
            sensors_file=args.sensors_file,
            map_file=args.map_file,
        )
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
