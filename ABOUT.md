# About EcoScan

## What Inspired This Project

EcoScan emerged from a simple but urgent question: **How can we help conservation teams quickly identify which species are under pressure in a given habitat?**

The inspiration came from observing existing tools like Phyto Vision—elegant systems that use visual analysis to detect threats—but realizing they often lived in silos. They could see individual plants or animals, but couldn't explain the *habitat context* behind the risk. Meanwhile, satellite imagery and sensor networks were capturing rich environmental signals (temperature, moisture, air quality) that went underutilized in species assessments.

I wanted to build something that unified three information streams:
1. **Satellite habitat data** (NDVI, surface temperature, moisture indices)
2. **Distributed sensor networks** (PM2.5, humidity, soil moisture, water chemistry)
3. **Field photographic evidence** (guided or uploaded by users)

The result: a system that could say not just *"this species is endangered,"* but *"because of these specific habitat stressors in this location, combined with this photo evidence."*

---

## How We Built It

### Architecture: Backend Fusion + React Frontend

**Backend (Python)**  
The core system is built around habitat-sensor fusion:
- **RasterCell model**: Divides geography into discrete cells, each with satellite-derived features (NDVI, surface temperature, moisture)
- **SensorReading integration**: Weighted interpolation brings nearby sensor measurements into each cell, using inverse-distance weighting to prioritize local signals
- **Environmental feature derivation**: Raw sensor/satellite data are transformed into interpretable stress metrics:
  - Vegetation stress: $1 - \text{normalize}(\text{NDVI}, 0.1, 0.9)$
  - Thermal stress: $\text{normalize}(\text{surface\_temp}, 18°C, 45°C)$
  - Moisture stress: $1 - \text{normalize}(\text{moisture\_index}, 0.1, 0.9)$
  - Air quality, soil, water chemistry each contribute similarly
- **Species library + pressure matching**: A curated library of ~6 key species (monarch butterflies, California red-legged frogs, acorn woodpeckers, valley oaks, pond turtles, black phoebes) maps environmental stressors to vulnerability profiles
- **Upload-driven photo analysis**: When users upload field photos, a scene-understanding pipeline extracts visual cues (vegetation greenness, water clarity, visible animals) and cross-references them against species habitat needs

**Frontend (React + TypeScript + Tailwind + shadcn)**  
The UI is built for storytelling, not just data dumping:
- **Cinematic hero section** with narrative framing ("See species at risk. Act on data.")
- **Guided walkthrough** using sample field data for instant demo credibility
- **Upload-driven analysis** where photos become the source of truth for species detection
- **Synchronized map + species + scan views**: clicking an evidence card highlights the corresponding habitat zone and scan detection
- **Species gallery** with image-rich evidence cards showing confidence levels and actionable next steps
- **Model status transparency**: UI clearly states whether scoring is based on fine-tuned taxa classification, zero-shot fallback, or heuristic matching

### Data Flow

```
Satellite + Sensor Data → Fused Habitat Cells → Environmental Stress Profiles
                                                        ↓
                                                  Species Library
                                                        ↓
User Photo Evidence ───────────────→ Scene Understanding ───→ Risk Assessment
                                                        ↓
                        Interactive Dashboard (Map + Species + Actions)
```

The backend serves the frontend via FastAPI on port 8000; the frontend (React dev server) runs on port 5173. For desktop mode, `pywebview` wraps the browser in a native window, no browser tab required.

---

## Key Learnings

### 1. **Branch Discipline is Non-Negotiable**
Early in development, feature work accidentally leaked into `main`, breaking the stable baseline. This taught me hard lesson: every team member (including future self) needs crystal-clear rules about what branches are safe vs. experimental. Now, all feature work happens on named branches (`ui-update`, `photo-ai-system`) and `main` is protected.

### 2. **Demo Reliability Beats Feature Completeness**
A hackathon judges a polished, working 5-minute demo over half-finished sophistication. Building sample data walkthrough mode first—even though heuristic matching is weaker than an ML model—meant users saw instant, coherent results. This became the foundation of trust before adding photo upload complexity.

### 3. **Realistic Guarantees Matter**
Early messaging promised perfect species detection accuracy. That's dishonest. Real systems have limits: our heuristics work best on well-defined habitats with good sensor coverage. Shifting language to "habitat risk scoring that photo evidence can refine" earned more credibility than overselling.

### 4. **One-Command Deployment Reduces Friction**
Implementing `./run.sh` (one script that starts both backend and frontend) and `./stop.sh` (clean shutdown) meant:
- Users could test the full system in seconds, not 10 minutes of setup
- Developers iterated faster
- Demos didn't fail on environment mismatches

### 5. **Spatial Data is Hard to Visualize**
Making sense of a geographic grid + sensor readings + species risk in a 2D interface is non-trivial. We settled on:
- Interactive map highlighting hotspots by risk level
- Species cards synchronized to map zones
- Photo evidence cards that can pin to specific cells
This reduced cognitive load while preserving spatial context.

### 6. **UI State Management Scales Linearly**
Once we had guided mode + upload mode + model status + evidence sync + map highlights, tracking state in React became complex. Lesson: invest in a clear state machine early (guided/uploaded/analyzing), not a tangled cascade of booleans.

---

## Challenges We Faced

### 1. **Weighted Sensor Interpolation Tuning**
Inverse-distance weighting with power parameter $p=2.0$ and radius $r=0.4$ worked well in testing, but real-world sensor networks are sparse. We learned:
- Too-aggressive weighting → one sensor dominates the entire region
- Too-conservative weighting → distant sensors add noise
- Solution: empirically validate against ground truth; allow radius/power tuning as config

### 2. **Species Library Coverage**
We started with 6 keystone species because:
- Full biodiversity is unbounded
- Conservation orgs work on priority species lists
- Overpromising "detect any species" led to false confidences
Teaching the UI to communicate "this system focuses on X priority species" was crucial.

### 3. **Photo Evidence Matching Without Deep Learning**
Early user uploads showed heuristic image analysis (pixel statistics, color histograms) is fragile. A green image could be healthy vegetation *or* unhealthy algae. Real solution:
- Fine-tune a small vision model on target taxa (not yet deployed, but roadmapped)
- For now, use heuristics only to suggest candidates; let human experts confirm
- Show confidence scores honestly

### 4. **Frontend Build Complexity**
Getting React + TypeScript + Tailwind + shadcn components + Vite to coordinate was error-prone. Issues:
- Import path aliases (`@/*`) had to match tsconfig carefully
- PostCSS config for Tailwind had subtle interactions with Vite
- Temporary solution: locked versions; long-term: simplify component dependencies

### 5. **Desktop Window vs. Web Fallback**
`pywebview` is elegant but has platform quirks (macOS permissions, Windows path handling). We maintained:
- Browser-first dev workflow (`./run.sh`)
- Desktop window as an optional mode (`./run-desktop.sh`)
- Fallback to web if desktop dependencies are missing
This flexibility absorbed environment surprises.

### 6. **Balancing Scientific Accuracy vs. Storytelling**
Conservation biologists expect rigorous uncertainty quantification. Marketing wants clear, actionable insights. The middle ground:
- Show confidence intervals in advanced panels
- Summarize as "Low / Medium / High threat" for quick decisions
- Link every claim to source documentation (species URLs, habitat papers)

---

## What We Learned About Team + Tech Workflow

1. **Clear commit messages prevent history from becoming noise** — after one mistaken main-branch commit, we added a pre-commit check mindset
2. **Sample data is a user interface** — well-chosen demo inputs teach more than any README
3. **Model transparency builds trust** — explicitly saying "this is heuristic-driven" > hiding complexity
4. **One-command local dev + staging + prod is worth the effort** — iteration speed compounds over a week of hacking

---

## The Philosophy: Simple, Honest, Actionable

- *Simple*: Don't bury risk in confidence matrices. Show it as a color (green/yellow/red) + a sentence
- *Honest*: Admit what we know (sensor data) and what we guess (species matching). Show the difference
- *Actionable*: Every risk hotspot includes concrete next steps (survey, restore, monitor)

This isn't a publication-grade research tool. It's a field assistant for conservation teams who need to prioritize limited resources. If it gets you to the right habitat zone and highlights the right species 70% of the time, humans can take over from there.

---

## What's Next

The roadmap includes:
1. **Fine-tuned vision model** for per-photo taxa classification (currently zero-shot/heuristic)
2. **3D mesh/point-cloud ingestion** for detailed habitat reconstruction (directional, not yet built)
3. **Batch processing** for multi-location habitat surveys
4. **Integration with conservation databases** (IUCN Red List, NatureServe)
5. **Field team feedback loops** to calibrate risk thresholds by region

The foundation is solid. The next phase is depth: narrowing uncertainty and amplifying field-team feedback.

---

## Tagline

**"See Species at Risk. Act on Data."**

Or: *Satellite + Sensors + Stories → Conservation Action*
