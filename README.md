# EcoScan

EcoScan is a biodiversity health dashboard that combines habitat cells, environmental sensor context, and species-specific habitat rules to show which plants and animals are under stress first.

It now also supports:

- photo upload analysis through a target-taxa detector pipeline that can prefer a fine-tuned local checkpoint
- binary and ASCII mesh / point-cloud ingestion for `PLY`, `OBJ`, `LAS`, `LAZ`, `XYZ`, and `PTS` files
- surface-aware scan segmentation, calibrated confidence scores, batch analysis jobs, and exportable HTML reports

The current demo is centered on the real Coyote Valley and Coyote Creek corridor in South San Jose, California:

- `./run.sh` starts everything locally
- the website has compact interactive views instead of one long scrolling page
- the sample data is tied to real places and public conservation references
- you can swap in your own `CSV` and `JSON` files without editing the code

## What EcoScan Does

EcoScan loads habitat and sensor data, fuses them into per-zone stress signals, and translates those signals into species pressure.

For each habitat polygon, EcoScan:

1. Reads satellite-style habitat features such as `ndvi`, `surface_temp_c`, `moisture_index`, and `elevation_m`
2. Reads nearby sensor values such as `pm25`, `humidity`, `soil_moisture`, and `water_ph`
3. Computes stress indicators like vegetation stress, moisture stress, thermal stress, and water-quality stress
4. Scores each habitat as `thriving`, `stressed`, or `fragile`
5. Estimates which species and plants are most likely to be suffering in that habitat
6. Displays the results in a local web app with tabs for overview, real map, species watch, and data sources

When you upload visual evidence, EcoScan additionally:

1. Runs a fine-tuned species detector when you provide a local target-taxa checkpoint, otherwise falls back to the zero-shot detector
2. Calibrates those model scores using a local labeled validation set
3. Parses uploaded point-cloud or mesh geometry into surface-aware segments or point clusters
4. Aligns scan segments to the study-area map using real coordinates when the file provides them
5. Annotates the resulting detections with evidence, action items, and exportable reports

## Current Demo Story

The default demo focuses on species that make a convincing biodiversity story for Coyote Valley:

- Monarch butterfly
- California red-legged frog
- Western pond turtle
- Acorn woodpecker
- Valley oak saplings
- California milkweed
- Black phoebe
- Coyote brush

The map centers on real Coyote Valley coordinates, and the sample file metadata points to public sources for:

- Coyote Creek Outdoor Classroom and regional water context
- Coyote Valley landscape and wildlife linkage context
- official species habitat guidance for monarchs and California red-legged frogs

Important note:

- the sample location, landmarks, and source references are real
- the sample species logic is based on public habitat guidance
- the sample numeric sensor values are representative, normalized demo inputs designed for local testing and hackathon presentation

That means the project is honest and easy to demo: it is a source-backed prototype, not a claim of live regulatory monitoring.

## Quick Start

From the project root:

```bash
./run.sh
```

`run.sh` will:

- create a local `.venv` if needed
- install the full app dependencies if they are missing
- start the local EcoScan server
- use the source-backed sample files in `data/sample_inputs/`
- open the dashboard automatically on macOS

Then open:

```text
http://127.0.0.1:8000
```

If you want to run manually:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir data/sample_inputs
```

That means the default local startup path is a single command:

```bash
./run.sh
```

To swap in your own fine-tuned detector, point EcoScan at a local Hugging Face object-detection checkpoint and an optional manifest:

```bash
export ECOSCAN_FINE_TUNED_MODEL=/absolute/path/to/your/fine-tuned-checkpoint
export ECOSCAN_FINE_TUNED_MANIFEST=data/model_manifests/target_taxa_detector.example.json
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir data/sample_inputs
```

The checkpoint should be compatible with `transformers.AutoModelForObjectDetection` and `AutoImageProcessor`. The manifest maps the model's labels onto EcoScan's species names and declares the target taxa surfaced in the explanation panel.

## Evaluation

Current detector and calibration numbers are based on the bundled validation file at `data/validation/species_detector_validation.json`.

- Validation set size: `24` labeled samples across `8` tracked species
- Score range in the current validation file: raw detector scores from `0.27` to `0.91`
- Raw-score baseline on that small validation set: `1.00` accuracy, `0.1033` Brier score, `0.3727` log loss
- Current logistic calibration output on that same set: `0.7917` accuracy, `0.1309` Brier score, `0.4321` log loss

Interpretation:

- The calibration plumbing is in place, but the bundled validation corpus is still too small and too tidy to claim production-grade probability calibration.
- On the current sample file, calibration actually performs worse than the raw scores, which is a sign that the model should be re-fit on a larger and more realistic evaluation set before treating the confidences as decision-grade.
- Fine-tuned detector validation on real field images is not bundled in this repo. To claim true field performance, you still need a held-out photo benchmark for your target taxa and a checkpoint trained for those species.

Supported input limits today:

- Photos: multiple `JPG`, `PNG`, or `WebP` images per analysis job
- Scans: `PLY`, `OBJ`, `LAS`, `LAZ`, `XYZ`, `PTS`, and `TXT`
- Minimum geometry for scan ingestion: `3` points or vertices
- Background processing concurrency: `2` jobs at a time
- Large uploads are currently constrained by available machine memory and CPU; there is no separate application-level file size cap yet

## Sample Screenshot

![EcoScan sample dashboard](docs/sample-dashboard.svg)

## Raw Output

To inspect the modeled output in the terminal:

```bash
PYTHONPATH=src python3 -m ecoscan.cli demo --data-dir data/sample_inputs
```

This prints:

- study area metadata
- biodiversity overview
- species catalog rollup
- most fragile habitat
- habitat-level recommendations

## Project Structure

```text
EcoScan/
├── run.sh
├── data/
│   └── sample_inputs/
│       ├── habitats.csv
│       ├── sensors.csv
│       └── map.json
├── docs/
│   └── sample-dashboard.svg
├── src/
│   └── ecoscan/
│       ├── api.py
│       ├── cli.py
│       ├── dataio.py
│       ├── demo.py
│       ├── fusion.py
│       ├── models.py
│       ├── pipeline.py
│       ├── server.py
│       └── static/
└── tests/
```

## Input Files

EcoScan accepts three file types.

### `habitats.csv`

Required columns:

```text
cell_id,centroid_lon,centroid_lat,ndvi,surface_temp_c,moisture_index,elevation_m
```

What these mean:

- `cell_id`: unique polygon or grid-cell ID
- `centroid_lon` and `centroid_lat`: the location of the habitat cell
- `ndvi`: vegetation greenness index from satellite or raster analysis
- `surface_temp_c`: land-surface temperature in Celsius
- `moisture_index`: normalized moisture indicator
- `elevation_m`: elevation in meters

### `sensors.csv`

Required columns:

```text
sensor_id,lon,lat,pm25,humidity,soil_moisture,water_ph
```

What these mean:

- `sensor_id`: station ID used across the app
- `lon` and `lat`: station coordinates
- `pm25`: air quality value
- `humidity`: relative humidity
- `soil_moisture`: normalized soil moisture
- `water_ph`: water chemistry context

### `map.json`

`map.json` controls the story layer and map layer. At minimum, it should contain:

- `study_area`
- `cell_polygons`

Recommended fields for the best experience:

- `landmarks`
- `system_snapshot`
- `location_context`
- `sensor_profiles`
- `data_sources`

The current sample file shows the full recommended structure.

## Use Your Own Data

Point EcoScan at your own folder:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir /path/to/my-inputs
```

Or pass the files one-by-one:

```bash
PYTHONPATH=src python3 -m ecoscan.cli demo \
  --cells-file /path/to/habitats.csv \
  --sensors-file /path/to/sensors.csv \
  --map-file /path/to/map.json
```

You can also pass options through the launcher:

```bash
./run.sh --port 8123
```

## How To Implement Real Data

The easiest way to move from demo data to real data is to keep EcoScan's file schema and build small export steps from your actual sources.

### Recommended Real Data Workflow

1. Export or derive habitat cells from satellite or GIS data
2. Export real station readings from your sensor platform or public API
3. Convert both into `habitats.csv` and `sensors.csv`
4. Build a matching `map.json` with real polygons and source notes
5. Run EcoScan locally against that folder

### Good Real Data Sources For This Project

Habitat and land cover:

- Sentinel-2 vegetation indices
- Landsat land-surface temperature
- local `GeoTIFF`, `CSV`, or GIS exports
- `GeoJSON` polygons converted into the `cell_polygons` format

Sensors and field measurements:

- NOAA weather observations
- USGS water and groundwater stations
- EPA or regional air-quality monitors
- your own IoT CSV exports

Species context:

- state wildlife agencies
- U.S. Fish and Wildlife Service species pages
- local conservation or open-space agencies

### Practical Conversion Pattern

If your real data starts in tools like QGIS, Google Earth Engine, ArcGIS, or a notebook pipeline:

- generate one row per habitat unit in `habitats.csv`
- generate one row per station in `sensors.csv`
- export the habitat polygons into `map.json`
- include source URLs and notes in `map.json` so the website can explain where the data came from

### Suggested Real-Data Additions

If you want to take this farther after the hackathon:

1. add a small ingestion script that converts `GeoJSON` or `GeoTIFF` outputs into EcoScan CSVs
2. add a periodic fetch from NOAA, USGS, or your own sensor API
3. add species-specific rules for your exact ecosystem instead of the current Coyote Valley demo species set

## Website Views

The website is intentionally split into focused views so judges can understand the project quickly.

- `Overview`: system snapshot, plain-English narrative, top habitats, and top stressed species
- `Real map`: Leaflet map with real location coordinates, polygons, stations, and interactive detail panel
- `Species watch`: a larger species catalog with stress levels and habitat needs
- `Data & sources`: sensor context and public reference links

## Useful Commands

Start the local site:

```bash
./run.sh
```

Start it on another port:

```bash
./run.sh --port 8123
```

Print raw output:

```bash
PYTHONPATH=src python3 -m ecoscan.cli demo --data-dir data/sample_inputs
```

Run tests:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

## Troubleshooting

If the browser does not open automatically:

- keep the server running
- open `http://127.0.0.1:8000` manually

If port `8000` is already in use:

```bash
./run.sh --port 8123
```

If the map tiles do not load:

- check that your browser has internet access
- the app still runs locally, but the Leaflet base map depends on OpenStreetMap tiles

If your custom data fails to load:

- verify that `habitats.csv` and `sensors.csv` include the required columns
- verify that `map.json` contains `study_area` and `cell_polygons`

## Verification

The project can be verified with:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```
