# EcoScan

EcoScan is a biodiversity health mapping demo that combines habitat data, environmental sensors, and a local web dashboard to show where ecosystems are under stress.

The current demo focuses on a South San Jose corridor and highlights:

- Monarch butterfly
- California red-legged frog
- Acorn woodpecker
- Valley oak saplings

## Features

- Combines habitat inputs like NDVI, temperature, moisture, and elevation
- Combines sensor inputs like PM2.5, humidity, soil moisture, and water pH
- Scores each habitat zone as `thriving`, `stressed`, or `fragile`
- Estimates which species or plants are most affected
- Shows results in a local browser dashboard with a map and sensor markers
- Supports simple file-based testing with `CSV` and `JSON`

## How It Works

EcoScan runs this pipeline:

1. Load habitat cells and sensor readings
2. Match nearby sensors to each habitat cell
3. Compute ecological stress signals
4. Score habitat health
5. Estimate species and plant pressure
6. Display the results on a local map dashboard

## Project Structure

```text
EcoScan/
├── data/
│   └── sample_inputs/
├── src/
│   └── ecoscan/
│       ├── cli.py
│       ├── dataio.py
│       ├── demo.py
│       ├── fusion.py
│       ├── models.py
│       ├── pipeline.py
│       ├── server.py
│       └── static/
├── tests/
└── README.md
```

## Quick Start

From the project root, start the local dashboard:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve
```

Then open:

```text
http://127.0.0.1:8000
```

## Run With Sample Files

EcoScan includes easy test inputs in:

- `data/sample_inputs/habitats.csv`
- `data/sample_inputs/sensors.csv`
- `data/sample_inputs/map.json`

Run the dashboard with those files:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir data/sample_inputs
```

Print the raw model output in the terminal:

```bash
PYTHONPATH=src python3 -m ecoscan.cli demo --data-dir data/sample_inputs
```

## Use Your Own Files

Point EcoScan at your own input folder:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir /path/to/my-inputs
```

Your folder should contain:

- `habitats.csv`
- `sensors.csv`
- optionally `map.json`

You can also pass files one by one:

```bash
PYTHONPATH=src python3 -m ecoscan.cli demo \
  --cells-file /path/to/habitats.csv \
  --sensors-file /path/to/sensors.csv \
  --map-file /path/to/map.json
```

## Input Format

`habitats.csv` columns:

```text
cell_id,centroid_lon,centroid_lat,ndvi,surface_temp_c,moisture_index,elevation_m
```

`sensors.csv` columns:

```text
sensor_id,lon,lat,pm25,humidity,soil_moisture,water_ph
```

`map.json` should include:

- `study_area`
- optional `landmarks`
- `cell_polygons`

If `map.json` is omitted, EcoScan still runs, but custom polygons and landmarks will not be shown.

## Useful Commands

Start the dashboard:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve
```

Start the dashboard on another port:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --port 8123
```

Print raw output:

```bash
PYTHONPATH=src python3 -m ecoscan.cli demo
```

Run tests:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

## What You Should See

In the browser:

- Habitat polygons on a map
- Sensor markers
- Biodiversity summary cards
- Habitat details
- Species pressure summaries
- Recommended interventions

In terminal output:

- Study area info
- Biodiversity overview stats
- Most fragile habitat
- Species pressure details

## Troubleshooting

If port `8000` is already in use:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --port 8123
```

If you get missing file errors, check that your input folder has the expected filenames.

If you want to verify everything still works:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```
