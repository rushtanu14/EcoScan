# EcoScan

EcoScan is a biodiversity-risk demo that combines habitat cells, sensor context, photo evidence, and scan overlays to explain which species are under pressure and what to do next.

This branch includes a full React + TypeScript + Tailwind + shadcn-style UI overhaul with:

- cinematic hero and narrative sections
- guided and upload-based photo intake
- species gallery cards with image-heavy evidence
- map and scan hotspot highlighting
- action-oriented output panels

## One-Command Run

From the repo root:

```bash
./run.sh
```

`run.sh` now starts:

- backend API on `http://127.0.0.1:8000`
- React frontend on `http://127.0.0.1:5173`

To stop everything:

```bash
./stop.sh
```

## Requirements

- Python 3.10+
- Node.js 20+ (for the React UI)

If `frontend/node_modules` is missing, `run.sh` installs frontend dependencies automatically.

## Setup (first time)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[api]"
```

Then run:

```bash
./run.sh
```

## UI Stack

The new UI lives in `frontend/` and uses:

- React
- TypeScript
- Tailwind CSS
- shadcn-style component structure

Important paths:

- components: `frontend/src/components/ui`
- app entry: `frontend/src/App.tsx`
- global styles: `frontend/src/index.css`

Why `components/ui` matters: it keeps primitives (button, card, select, accordion, sheet, etc.) centralized so large UI blocks remain composable and consistent.

## If You Need to Recreate shadcn/Tailwind/TS Support

If you start from a plain React app, use:

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Then wire Tailwind in `index.css` and set up `@/*` path aliases plus `src/components/ui`.

## Current Demo Flow

1. Open the UI.
2. Start from the story card (one clear narrative).
3. Use `Guided demo` for the safest walkthrough.
4. Optionally upload photos and run `Analyze uploads`.
5. Click evidence cards to synchronize species + map + scan views.
6. Show action items and source links.

## Data Files

Default sample inputs:

- `data/sample_inputs/habitats.csv`
- `data/sample_inputs/sensors.csv`
- `data/sample_inputs/map.json`

Run against your own files:

```bash
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir /path/to/my-inputs --port 8000
```

## Testing

Backend tests:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

Frontend type/build checks (when Node is available):

```bash
cd frontend
npm run build
```

## Key Files

```text
EcoScan/
├── run.sh
├── stop.sh
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── components/ui/
│   └── package.json
├── data/sample_inputs/
├── src/ecoscan/
│   ├── api.py
│   ├── pipeline.py
│   └── static/assets/
└── tests/
```

