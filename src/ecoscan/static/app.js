const summaryCards = document.getElementById("summaryCards");
const heroMetrics = document.getElementById("heroMetrics");
const habitatList = document.getElementById("habitatList");
const narrativeSummary = document.getElementById("narrativeSummary");
const stressedSpeciesRail = document.getElementById("stressedSpeciesRail");
const speciesList = document.getElementById("speciesList");
const sensorList = document.getElementById("sensorList");
const sourceList = document.getElementById("sourceList");
const actionList = document.getElementById("actionList");
const mapTitle = document.getElementById("mapTitle");
const scanTitle = document.getElementById("scanTitle");
const searchInput = document.getElementById("ecoscanSearch");
const searchSuggestions = document.getElementById("ecoscanSuggestions");
const photoUploadInput = document.getElementById("photoUploadInput");
const scanUploadInput = document.getElementById("scanUploadInput");
const jobStatusText = document.getElementById("jobStatusText");
const jobProgressBar = document.getElementById("jobProgressBar");
const jobProgressText = document.getElementById("jobProgressText");
const exportReportButton = document.getElementById("exportReportButton");
const photoGallery = document.getElementById("photoGallery");
const scanViewport = document.getElementById("scanViewport");
const scanLegend = document.getElementById("scanLegend");
const scanMetaPanel = document.getElementById("scanMetaPanel");
const detectionFeed = document.getElementById("detectionFeed");
const explanationPanel = document.getElementById("explanationPanel");
const modelStatusBanner = document.getElementById("modelStatusBanner");

const viewTabs = [...document.querySelectorAll("[data-view-target]")];
const views = [...document.querySelectorAll(".dashboard-view")];

let habitatState = [];
let sensorState = [];
let studyAreaState = null;
let landmarkState = [];
let speciesCatalogState = [];
let sensorProfilesState = [];
let dataSourcesState = [];
let searchablePlacesState = [];
let scanModelState = [];
let uploadedEvidenceState = [];
let searchIndex = [];
let selectedPhotoFiles = [];
let selectedScanFile = null;
let scanSummaryState = null;
let currentJobId = null;
let currentReportUrl = null;
let detectorSummaryState = null;

let activeCellId = null;
let activeSensorId = null;
let activeSpeciesName = null;

let map = null;
let habitatLayerGroup = null;
let scanOverlayLayerGroup = null;
let sensorLayerGroup = null;
let landmarkLayerGroup = null;

const titleCase = (value) =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function speciesRiskLevel(score) {
  if (score >= 0.68) {
    return "fragile";
  }
  if (score >= 0.42) {
    return "stressed";
  }
  return "thriving";
}

function statusColor(label) {
  if (label === "fragile") {
    return "#8e4d3d";
  }
  if (label === "stressed") {
    return "#c48a48";
  }
  return "#5c7d62";
}

function activateView(targetId) {
  viewTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === targetId);
  });
  views.forEach((view) => {
    view.classList.toggle("is-active", view.id === targetId);
  });
}

function findSpeciesByName(name) {
  return speciesCatalogState.find((species) => species.common_name === name);
}

function findHabitatById(cellId) {
  return habitatState.find((habitat) => habitat.cell_id === cellId);
}

function findScanCell(cellId) {
  return scanModelState.find((cell) => cell.cell_id === cellId);
}

function scoreForSpecies(habitat, speciesName) {
  if (!speciesName) {
    return habitat.risk_score;
  }
  return habitat.species_pressures.find((pressure) => pressure.common_name === speciesName)?.vulnerability_score ?? habitat.risk_score;
}

function activeOverview() {
  const leadSpecies = findSpeciesByName(activeSpeciesName) || speciesCatalogState[0];
  const leadHabitat = habitatState.find((habitat) => habitat.cell_id === activeCellId) || habitatState[0];
  return {
    species: leadSpecies,
    habitat: leadHabitat,
  };
}

function buildSummaryCards(overview) {
  const cards = [
    { label: "Average biodiversity score", value: `${overview.avg_biodiversity_score}` },
    { label: "Fragile scan cells", value: `${overview.fragile_cells}`, className: "danger" },
    { label: "Stressed cells", value: `${overview.stressed_cells}`, className: "warning" },
    { label: "Lead species at risk", value: overview.top_species_at_risk[0] || "N/A" },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card ${card.className || ""}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join("");
}

function buildHeroMetrics(overview) {
  const focus = activeOverview();
  const leadActions = focus.habitat?.recommended_actions || overview.priority_actions || [];
  heroMetrics.innerHTML = `
    <article class="metric-pill">
      <span>Study area</span>
      <strong>${studyAreaState.region}</strong>
      <p>${studyAreaState.name}</p>
    </article>
    <article class="metric-pill">
      <span>Photo detections</span>
      <strong>${uploadedEvidenceState.length || scanModelState.length}</strong>
      <p>${uploadedEvidenceState.length ? "Uploaded evidence cards are ready for review." : "Scan-generated hotspots are ready for evidence review."}</p>
    </article>
    <article class="metric-pill">
      <span>Lead action</span>
      <strong>${leadActions.length}</strong>
      <p>${leadActions[0] || "No action identified yet."}</p>
    </article>
  `;
}

function buildNarrativeSummary() {
  const { species, habitat } = activeOverview();
  narrativeSummary.innerHTML = `
    <article class="summary-story">
      <p class="panel-label">Current focus</p>
      <h3>${species?.common_name || "No species found"}</h3>
      <p>${species?.narrative || "No narrative available."}</p>
      <div class="detail-stat-grid">
        <div class="detail-stat">
          <span>Detected hotspot</span>
          <strong>${habitat ? titleCase(habitat.habitat_type) : "Not available"}</strong>
        </div>
        <div class="detail-stat">
          <span>Habitat status</span>
          <strong>${habitat ? titleCase(habitat.health_label) : "Not available"}</strong>
        </div>
      </div>
      <p><strong>What was flagged:</strong> ${habitat?.habitat_story || "No scan story available."}</p>
      <p><strong>Why it matters:</strong> ${species?.habitat_need || "No habitat need available."}</p>
    </article>
  `;
}

function buildActionList() {
  const actions = new Set();
  const habitat = findHabitatById(activeCellId) || habitatState[0];
  (habitat?.recommended_actions || []).forEach((action) => actions.add(action));
  (findSpeciesByName(activeSpeciesName)?.action_items || []).forEach((action) => actions.add(action));

  actionList.innerHTML = [...actions]
    .slice(0, 4)
    .map(
      (action, index) => `
        <article class="action-card">
          <span>Action ${index + 1}</span>
          <strong>${action}</strong>
        </article>
      `,
    )
    .join("");
}

function setJobStatus(text) {
  if (jobStatusText) {
    jobStatusText.textContent = text;
  }
}

function setJobProgress(progress, message = "") {
  const safeProgress = Math.max(0, Math.min(Number(progress || 0), 100));
  if (jobProgressBar) {
    jobProgressBar.style.width = `${safeProgress}%`;
  }
  if (jobProgressText) {
    jobProgressText.textContent = message ? `${safeProgress}% complete • ${message}` : `${safeProgress}% complete`;
  }
}

function buildModelStatusBanner() {
  if (!modelStatusBanner) {
    return;
  }
  const summary = detectorSummaryState || {
    mode: "idle",
    label: "Photo detector idle",
    message: "Upload photos to see whether EcoScan used the fine-tuned detector, zero-shot fallback, or heuristic fallback.",
    target_taxa: [],
  };
  modelStatusBanner.className = `model-status-banner ${summary.mode || "idle"}`;
  modelStatusBanner.innerHTML = `
    <span class="model-status-kicker">Detector path</span>
    <strong>${summary.label || summary.model_name || "Photo detector idle"}</strong>
    <p>${summary.message || "Upload photos to inspect the active detector path."}</p>
    ${
      summary.target_taxa?.length
        ? `<div class="tag-row">${summary.target_taxa.slice(0, 6).map((label) => `<span class="tag">${label}</span>`).join("")}</div>`
        : ""
    }
  `;
}

function buildHabitatList() {
  habitatList.innerHTML = habitatState
    .slice(0, 8)
    .map(
      (habitat, index) => `
        <button class="habitat-row ${habitat.health_label} ${habitat.cell_id === activeCellId ? "is-active" : ""}" data-cell-id="${habitat.cell_id}">
          <span class="row-rank">#${index + 1}</span>
          <span class="row-main">
            <strong>${titleCase(habitat.habitat_type)}</strong>
            <small>${habitat.species_pressures[0].common_name}</small>
          </span>
          <span class="row-score">${formatPercent(habitat.risk_score)}</span>
        </button>
      `,
    )
    .join("");

  habitatList.querySelectorAll(".habitat-row").forEach((button) => {
    button.addEventListener("click", () => {
      activeCellId = button.dataset.cellId;
      activeSpeciesName = findHabitatById(activeCellId)?.species_pressures[0]?.common_name || activeSpeciesName;
      drawScanModel();
      drawMapLayers();
      buildNarrativeSummary();
      buildActionList();
      buildStressedSpeciesRail();
      buildSpeciesList();
      buildExplanationPanel();
      buildDetectionFeed();
    });
  });
}

function buildStressedSpeciesRail() {
  stressedSpeciesRail.innerHTML = speciesCatalogState
    .slice(0, 6)
    .map(
      (species) => `
        <button class="rail-species ${species.status_label} ${species.common_name === activeSpeciesName ? "is-active" : ""}" data-species-name="${species.common_name}">
          <span>${species.common_name}</span>
          <strong>${formatPercent(species.avg_vulnerability_score)}</strong>
        </button>
      `,
    )
    .join("");

  stressedSpeciesRail.querySelectorAll(".rail-species").forEach((button) => {
    button.addEventListener("click", () => {
      activeSpeciesName = button.dataset.speciesName;
      activeCellId = habitatState.find((habitat) =>
        habitat.species_pressures.some((pressure) => pressure.common_name === activeSpeciesName),
      )?.cell_id || activeCellId;
      buildHeroMetrics({ priority_actions: [] });
      buildNarrativeSummary();
      buildActionList();
      drawScanModel();
      drawMapLayers();
      buildStressedSpeciesRail();
      buildSpeciesList();
      buildExplanationPanel();
      buildDetectionFeed();
      activateView("speciesView");
    });
  });
}

function speciesExtremes(speciesName) {
  const scored = habitatState
    .map((habitat) => ({ habitat, score: scoreForSpecies(habitat, speciesName) }))
    .sort((left, right) => right.score - left.score);
  return {
    high: scored[0] ? `${titleCase(scored[0].habitat.habitat_type)} at ${formatPercent(scored[0].score)}` : "Not available",
    low: scored[scored.length - 1]
      ? `${titleCase(scored[scored.length - 1].habitat.habitat_type)} at ${formatPercent(scored[scored.length - 1].score)}`
      : "Not available",
  };
}

function buildSpeciesList() {
  speciesList.innerHTML = speciesCatalogState
    .map((species) => {
      const extremes = speciesExtremes(species.common_name);
      return `
        <article class="species-item species-card ${species.status_label} ${species.common_name === activeSpeciesName ? "is-active" : ""}" data-species-name="${species.common_name}">
          <div class="species-image-grid">
            <img src="${species.image_asset}" alt="${species.common_name}" class="species-hero-image" />
            ${species.example_images
              .map((image, index) => `<img src="${image}" alt="${species.common_name} example ${index + 1}" class="species-example-image" />`)
              .join("")}
          </div>
          <div class="species-content">
            <div class="species-topline">
              <span>${titleCase(species.kingdom)}</span>
              <strong>${species.common_name}</strong>
            </div>
            <p><em>${species.scientific_name}</em></p>
            <p>${species.narrative}</p>
            <div class="species-meta">
              <span>${species.stressed_habitat_count}/${species.total_habitats} habitats under stress</span>
              <strong>${formatPercent(species.avg_vulnerability_score)}</strong>
            </div>
            <div class="detail-stat-grid">
              <div class="detail-stat">
                <span>Habitat need</span>
                <strong>${species.habitat_need}</strong>
              </div>
              <div class="detail-stat">
                <span>Strongest hotspot</span>
                <strong>${extremes.high}</strong>
              </div>
            </div>
            <div>
              <p class="panel-label">Pressure factors</p>
              <div class="tag-row">
                ${species.pressure_factors.map((factor) => `<span class="tag">${titleCase(factor)}</span>`).join("")}
              </div>
            </div>
            <div>
              <p class="panel-label">Action items</p>
              <div class="tag-row">
                ${species.action_items.map((action) => `<span class="tag action-tag">${action}</span>`).join("")}
              </div>
            </div>
            <div class="species-footnote">
              <span>Healthier refuge: ${extremes.low}</span>
              <a href="${species.source_url}" target="_blank" rel="noreferrer">Open reference</a>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  speciesList.querySelectorAll(".species-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }
      activeSpeciesName = item.dataset.speciesName;
      activeCellId = habitatState.find((habitat) =>
        habitat.species_pressures.some((pressure) => pressure.common_name === activeSpeciesName),
      )?.cell_id || activeCellId;
      buildHeroMetrics({ priority_actions: [] });
      buildNarrativeSummary();
      buildActionList();
      buildStressedSpeciesRail();
      buildSpeciesList();
      drawScanModel();
      drawMapLayers();
      buildExplanationPanel();
      buildDetectionFeed();
    });
  });
}

function buildMapHeader() {
  mapTitle.textContent = activeSpeciesName
    ? `${studyAreaState.name} map • ${activeSpeciesName}`
    : `${studyAreaState.name} map`;
}

function ensureMap() {
  if (map || !window.L) {
    return;
  }

  map = window.L.map("leafletMap", { zoomControl: false, attributionControl: true });
  window.L.control.zoom({ position: "bottomright" }).addTo(map);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  habitatLayerGroup = window.L.layerGroup().addTo(map);
  scanOverlayLayerGroup = window.L.layerGroup().addTo(map);
  sensorLayerGroup = window.L.layerGroup().addTo(map);
  landmarkLayerGroup = window.L.layerGroup().addTo(map);

  const center = studyAreaState.center || {
    lat: (studyAreaState.bounds.north + studyAreaState.bounds.south) / 2,
    lon: (studyAreaState.bounds.east + studyAreaState.bounds.west) / 2,
  };
  map.setView([center.lat, center.lon], 12);
}

function drawLandmarks() {
  landmarkLayerGroup.clearLayers();
  landmarkState.forEach((landmark) => {
    const latLngs = landmark.coordinates.map(([lon, lat]) => [lat, lon]);
    if (landmark.kind === "waterway") {
      window.L.polyline(latLngs, {
        color: "#6f93a4",
        weight: 4,
        opacity: 0.9,
      })
        .bindTooltip(landmark.name)
        .addTo(landmarkLayerGroup);
      return;
    }

    window.L.polygon(latLngs, {
      color: "rgba(57, 48, 41, 0.35)",
      weight: 1,
      fillColor: landmark.kind === "urban_edge" ? "#c79d7d" : "#b1bf9f",
      fillOpacity: 0.16,
    })
      .bindTooltip(landmark.name)
      .addTo(landmarkLayerGroup);
  });
}

function drawMapLayers() {
  buildMapHeader();
  if (!window.L) {
    document.getElementById("leafletMap").innerHTML = `
      <div class="map-fallback">
        <strong>Map tiles unavailable.</strong>
        <p>The visual scan still works, but the spatial base map could not load in this browser session.</p>
      </div>
    `;
    return;
  }

  ensureMap();
  habitatLayerGroup.clearLayers();
  scanOverlayLayerGroup.clearLayers();
  sensorLayerGroup.clearLayers();
  drawLandmarks();

  habitatState.forEach((habitat) => {
    const score = scoreForSpecies(habitat, activeSpeciesName);
    const status = activeSpeciesName ? speciesRiskLevel(score) : habitat.health_label;
    const polygon = window.L.polygon(
      habitat.polygon.map(([lon, lat]) => [lat, lon]),
      {
        color: statusColor(status),
        weight: habitat.cell_id === activeCellId ? 3.4 : 1.5,
        fillColor: statusColor(status),
        fillOpacity: habitat.cell_id === activeCellId ? 0.72 : 0.3,
      },
    );

    polygon.on("click", () => {
      activeCellId = habitat.cell_id;
      activeSpeciesName = habitat.species_pressures[0].common_name;
      drawMapLayers();
      drawScanModel();
      buildHabitatList();
      buildNarrativeSummary();
      buildActionList();
      buildSpeciesList();
      buildDetectionFeed();
    });

    polygon.bindTooltip(`${titleCase(habitat.habitat_type)} • ${formatPercent(score)}`);
    polygon.addTo(habitatLayerGroup);
  });

  sensorState.forEach((sensor) => {
    const profile = sensorProfilesState.find((item) => item.sensor_id === sensor.sensor_id);
    const marker = window.L.circleMarker([sensor.location[1], sensor.location[0]], {
      radius: sensor.sensor_id === activeSensorId ? 9 : 7,
      color: "#2c241e",
      weight: 1.5,
      fillColor: "#fdf7ef",
      fillOpacity: 0.94,
    });
    marker.on("click", () => {
      activeSensorId = sensor.sensor_id;
      buildSensorList();
    });
    marker.bindTooltip(profile?.label || titleCase(sensor.sensor_id));
    marker.addTo(sensorLayerGroup);
  });

  scanModelState
    .filter((cell) => cell.map_polygon && cell.map_polygon.length && (!activeSpeciesName || cell.detections.some((detection) => detection.species_name === activeSpeciesName)))
    .slice(0, 10)
    .forEach((cell) => {
      const polygon = window.L.polygon(
        cell.map_polygon.map(([lon, lat]) => [lat, lon]),
        {
          color: "#163128",
          weight: cell.cell_id === activeCellId ? 2.8 : 1.2,
          dashArray: "6 4",
          fillColor: statusColor(cell.health_label),
          fillOpacity: cell.cell_id === activeCellId ? 0.18 : 0.08,
        },
      );
      polygon.on("click", () => {
        activeCellId = cell.cell_id;
        activeSpeciesName = cell.detections?.[0]?.species_name || activeSpeciesName;
        buildExplanationPanel();
        drawMapLayers();
        drawScanModel();
        buildDetectionFeed();
      });
      polygon.bindTooltip(`Segment ${cell.segment_kind || "scan"} • ${cell.detections?.[0]?.species_name || "species"}`);
      polygon.addTo(scanOverlayLayerGroup);
    });
}

function buildSensorList() {
  sensorList.innerHTML = sensorState
    .map((sensor) => {
      const profile = sensorProfilesState.find((item) => item.sensor_id === sensor.sensor_id);
      return `
        <button class="sensor-item ${sensor.sensor_id === activeSensorId ? "is-active" : ""}" data-sensor-id="${sensor.sensor_id}">
          <div class="species-topline">
            <span>${profile?.kind || "Field sensor"}</span>
            <strong>${profile?.label || titleCase(sensor.sensor_id)}</strong>
          </div>
          <p>${profile?.summary || "Field context for nearby habitats."}</p>
          <div class="sensor-grid">
            <span>PM2.5 ${sensor.readings.pm25}</span>
            <span>Humidity ${sensor.readings.humidity}</span>
            <span>Soil ${sensor.readings.soil_moisture}</span>
            <span>pH ${sensor.readings.water_ph}</span>
          </div>
        </button>
      `;
    })
    .join("");

  sensorList.querySelectorAll(".sensor-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeSensorId = button.dataset.sensorId;
      buildSensorList();
    });
  });
}

function buildSourceList() {
  sourceList.innerHTML = dataSourcesState
    .map(
      (source) => `
        <article class="source-item">
          <div class="species-topline">
            <span>${source.kind}</span>
            <strong>${source.name}</strong>
          </div>
          <p>${source.note}</p>
          <a href="${source.url}" target="_blank" rel="noreferrer">Open source</a>
        </article>
      `,
    )
    .join("");
}

function scanCentroid(points) {
  const x = points.reduce((sum, [px]) => sum + px, 0) / points.length;
  const y = points.reduce((sum, [, py]) => sum + py, 0) / points.length;
  return [x, y];
}

function projectScanPoint(point, height) {
  const [px, py] = point;
  const x = 120 + px * 620 + py * 160;
  const y = 420 + py * 180 - px * 70 - height * 110;
  return [x, y];
}

function offsetPolygon(points, offsetY) {
  return points.map(([x, y]) => `${x},${y + offsetY}`).join(" ");
}

function pointsToString(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function drawScanModel() {
  const visibleCells = scanModelState.filter((cell) => !activeSpeciesName || cell.detections.some((detection) => detection.species_name === activeSpeciesName));
  const topCells = visibleCells.slice(0, 8);
  scanTitle.textContent = activeSpeciesName
    ? `3D scan focus • ${activeSpeciesName}`
    : "Species hotspots across the scan";

  scanLegend.innerHTML = `
    <span><i class="legend-swatch thriving"></i>Lower risk</span>
    <span><i class="legend-swatch stressed"></i>Heightened stress</span>
    <span><i class="legend-swatch fragile"></i>Critical hotspot</span>
  `;

  if (!topCells.length) {
    scanViewport.innerHTML = `<p class="empty-state">No scan cells match the current species filter.</p>`;
    return;
  }

  const svgMarkup = topCells
    .map((cell) => {
      const topFace = cell.projected_polygon.map((point) => projectScanPoint(point, cell.canopy_height));
      const centroid = scanCentroid(topFace);
      const isActive = cell.cell_id === activeCellId || cell.lead_species === activeSpeciesName;
      const callout = cell.detections[0];
      return `
        <g class="scan-cell ${cell.health_label} ${isActive ? "is-active" : ""}" data-cell-id="${cell.cell_id}">
          <polygon class="scan-wall" points="${offsetPolygon(topFace, 44)}"></polygon>
          <polygon class="scan-top" points="${pointsToString(topFace)}"></polygon>
          <circle cx="${centroid[0]}" cy="${centroid[1]}" r="${isActive ? 8 : 5}" class="scan-pin"></circle>
          <text x="${centroid[0] + 14}" y="${centroid[1] - 10}" class="scan-label">${callout.species_name}</text>
          <text x="${centroid[0] + 14}" y="${centroid[1] + 10}" class="scan-subtitle">${formatPercent(callout.confidence)}</text>
        </g>
      `;
    })
    .join("");

  scanViewport.innerHTML = `
    <svg class="scan-svg" viewBox="0 0 1000 620" role="img" aria-label="Stylized 3D ecological scan">
      <defs>
        <linearGradient id="scanFloor" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f7efe4"></stop>
          <stop offset="100%" stop-color="#dcc8b1"></stop>
        </linearGradient>
      </defs>
      <polygon points="110,470 730,360 905,470 275,590" fill="url(#scanFloor)" opacity="0.9"></polygon>
      ${svgMarkup}
    </svg>
  `;

  scanViewport.querySelectorAll(".scan-cell").forEach((group) => {
    group.addEventListener("click", () => {
      activeCellId = group.dataset.cellId;
      activeSpeciesName = findScanCell(activeCellId)?.detections[0]?.species_name || activeSpeciesName;
      buildHeroMetrics({ priority_actions: [] });
      buildNarrativeSummary();
      buildActionList();
      buildHabitatList();
      buildStressedSpeciesRail();
      buildSpeciesList();
      buildExplanationPanel();
      buildDetectionFeed();
      drawMapLayers();
      drawScanModel();
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let binary = "";
      for (let index = 0; index < bytes.byteLength; index += 1) {
        binary += String.fromCharCode(bytes[index]);
      }
      resolve(window.btoa(binary));
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsArrayBuffer(file);
  });
}

async function createAnalysisJob() {
  if (!selectedPhotoFiles.length && !selectedScanFile) {
    return;
  }

  setJobStatus("Preparing upload");
  const photos = await Promise.all(
    selectedPhotoFiles.map(async (file) => ({
      name: file.name,
      data_url: await readFileAsDataUrl(file),
    })),
  );
  const scanFile = selectedScanFile
    ? {
        name: selectedScanFile.name,
        content: await readFileAsBase64(selectedScanFile),
        encoding: "base64",
      }
    : null;

  const response = await fetch("/api/jobs/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      photos,
      scan_file: scanFile,
      active_cell_id: activeCellId,
      active_species_name: activeSpeciesName,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || `Upload failed with ${response.status}`);
  }

  const payload = await response.json();
  currentJobId = payload.job_id;
  setJobStatus(`Queued ${currentJobId.slice(0, 8)}`);
  setJobProgress(payload.progress || 0, payload.message || "Waiting to start");
  return payload.job_id;
}

async function waitForJob(jobId) {
  while (true) {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Unable to fetch job ${jobId}`);
    }
    const payload = await response.json();
    const statusText = payload.message ? `${titleCase(payload.status)} • ${payload.message}` : titleCase(payload.status);
    setJobStatus(statusText);
    setJobProgress(payload.progress || 0, payload.stage ? titleCase(String(payload.stage).replace(/-/g, " ")) : "");
    if (payload.status === "completed") {
      return payload.result;
    }
    if (payload.status === "failed") {
      throw new Error(payload.error || "Analysis failed");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }
}

function applyAnalysisResult(payload) {
  uploadedEvidenceState = payload.uploaded_evidence || [];
  scanModelState = payload.scan_model || scanModelState;
  scanSummaryState = payload.scan_summary || null;
  detectorSummaryState = payload.detector_summary || detectorSummaryState;
  activeSpeciesName = payload.focus_species || uploadedEvidenceState[0]?.species_name || activeSpeciesName;
  activeCellId = uploadedEvidenceState[0]?.cell_id || scanModelState[0]?.cell_id || activeCellId;
  currentReportUrl = null;
  buildSearchIndex();
  buildHeroMetrics({ priority_actions: [] });
  buildNarrativeSummary();
  buildActionList();
  buildHabitatList();
  buildStressedSpeciesRail();
  buildSpeciesList();
  buildPhotoGallery();
  buildScanMetaPanel();
  buildModelStatusBanner();
  buildExplanationPanel();
  drawScanModel();
  drawMapLayers();
  buildDetectionFeed();
  setJobProgress(100, "Analysis complete");
}

function buildPhotoGallery() {
  if (!uploadedEvidenceState.length) {
    photoGallery.innerHTML = `<p class="empty-state">Upload photos to generate annotated detections.</p>`;
    return;
  }

  photoGallery.innerHTML = uploadedEvidenceState
    .map(
      (evidence) => `
        <article class="photo-card ${evidence.species_name === activeSpeciesName ? "is-active" : ""}" data-evidence-id="${evidence.id}">
          <div class="photo-frame">
            <img src="${evidence.preview_url}" alt="${evidence.species_name} upload ${evidence.name}" />
            ${evidence.boxes
              .map(
                (box, index) => `
                  <div
                    class="annotation-box"
                    style="left:${box.left}%; top:${box.top}%; width:${box.width}%; height:${box.height}%;"
                  >
                    <span>${index === 0 ? evidence.species_name : "supporting signal"}</span>
                  </div>
                `,
              )
              .join("")}
          </div>
          <div class="photo-meta">
            <strong>${evidence.species_name}</strong>
            <span>${formatPercent(evidence.confidence)}</span>
          </div>
          <p>${evidence.name}</p>
        </article>
      `,
    )
    .join("");

  photoGallery.querySelectorAll(".photo-card").forEach((card) => {
    card.addEventListener("click", () => {
      const evidence = uploadedEvidenceState.find((item) => item.id === card.dataset.evidenceId);
      if (!evidence) {
        return;
      }
      activeSpeciesName = evidence.species_name;
      activeCellId = evidence.cell_id;
      activateView("scanView");
      buildNarrativeSummary();
      buildActionList();
      buildHabitatList();
      buildStressedSpeciesRail();
      buildSpeciesList();
      drawScanModel();
      drawMapLayers();
      buildPhotoGallery();
      buildDetectionFeed();
    });
  });
}

function buildScanMetaPanel() {
  if (!scanSummaryState) {
    scanMetaPanel.innerHTML = `<p class="empty-state">Upload a scan to inspect segmentation details.</p>`;
    return;
  }

  const alignmentLabel = scanSummaryState.source_epsg ? `EPSG:${scanSummaryState.source_epsg}` : "Study-area aligned";

  scanMetaPanel.innerHTML = `
    <div class="detail-stat">
      <span>Scan file</span>
      <strong>${scanSummaryState.filename || "Not provided"}</strong>
    </div>
    <div class="detail-stat">
      <span>Points</span>
      <strong>${scanSummaryState.point_count || 0}</strong>
    </div>
    <div class="detail-stat">
      <span>Faces</span>
      <strong>${scanSummaryState.face_count || 0}</strong>
    </div>
    <div class="detail-stat">
      <span>Segmentation</span>
      <strong>${titleCase((scanSummaryState.segmentation_mode || "unknown").replace(/-/g, " "))}</strong>
    </div>
    <div class="detail-stat">
      <span>Spatial alignment</span>
      <strong>${alignmentLabel}</strong>
    </div>
  `;
}

function activeExplanation() {
  const evidence = uploadedEvidenceState.find((item) => item.species_name === activeSpeciesName && (!activeCellId || item.cell_id === activeCellId));
  if (evidence?.explanation) {
    return evidence.explanation;
  }
  const scanCell = findScanCell(activeCellId) || scanModelState.find((cell) => cell.detections.some((detection) => detection.species_name === activeSpeciesName));
  return scanCell?.detections?.[0]?.explanation || null;
}

function buildExplanationPanel() {
  const explanation = activeExplanation();
  if (!explanation) {
    explanationPanel.innerHTML = `<p class="empty-state">Model explanations will appear here after analysis.</p>`;
    return;
  }

  const features = explanation.visual_features || {};
  const matchedQueries = explanation.matched_queries || [];
  const isFallbackModel = String(explanation.model || "").toLowerCase().includes("fallback");
  const targetTaxa = explanation.target_taxa || [];
  const isFineTunedModel = explanation.detector_family === "fine-tuned";
  const isZeroShotModel = explanation.detector_family === "zero-shot";
  explanationPanel.innerHTML = `
    <article class="explanation-card">
      <div class="detail-stat-grid">
        <div class="detail-stat">
          <span>Detector score</span>
          <strong>${formatPercent(explanation.detector_score || 0)}</strong>
        </div>
        <div class="detail-stat">
          <span>Calibrated score</span>
          <strong>${formatPercent(explanation.calibrated_score || 0)}</strong>
        </div>
        <div class="detail-stat">
          <span>Habitat prior</span>
          <strong>${formatPercent(explanation.habitat_prior || 0)}</strong>
        </div>
        <div class="detail-stat">
          <span>Model</span>
          <strong>${explanation.model || explanation.segment_kind || "EcoScan"}</strong>
        </div>
      </div>
      <p>${explanation.reason || "This species combined the strongest model evidence with the strongest habitat prior."}</p>
      ${
        isFallbackModel
          ? `<p class="panel-note">This run fell back to the calibrated visual ranker because localized pretrained detections were unavailable for the uploaded image.</p>`
          : ""
      }
      ${
        isFineTunedModel && targetTaxa.length
          ? `<p class="panel-note">Fine-tuned target taxa: ${targetTaxa.join(", ")}.</p>`
          : ""
      }
      ${
        isZeroShotModel
          ? `<p class="panel-note">This run used the zero-shot fallback detector because a fine-tuned checkpoint was not active for this analysis.</p>`
          : ""
      }
      ${
        Object.keys(features).length
          ? `<div class="tag-row">${Object.entries(features)
              .map(([key, value]) => `<span class="tag">${titleCase(key)} ${Number(value).toFixed(2)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${
        matchedQueries.length
          ? `<div class="tag-row">${matchedQueries.map((label) => `<span class="tag">${label}</span>`).join("")}</div>`
          : ""
      }
    </article>
  `;
}

function evidenceFeedItems() {
  const uploaded = uploadedEvidenceState.filter((item) => {
    if (activeSpeciesName && item.species_name !== activeSpeciesName) {
      return false;
    }
    if (activeCellId && item.cell_id !== activeCellId) {
      return false;
    }
    return true;
  });
  if (uploaded.length) {
    return uploaded.map((item) => ({
      type: "photo",
      title: item.species_name,
      image: item.preview_url,
      subtitle: `${item.name} • ${formatPercent(item.confidence)}`,
      note: item.note,
      actions: item.action_items,
    }));
  }

  return scanModelState
    .filter((cell) => !activeCellId || cell.cell_id === activeCellId)
    .slice(0, 5)
    .flatMap((cell) =>
      cell.detections
        .filter((detection) => !activeSpeciesName || detection.species_name === activeSpeciesName)
        .map((detection) => {
          const species = findSpeciesByName(detection.species_name);
          return {
            type: "scan",
            title: detection.species_name,
            image: species?.image_asset,
            subtitle: `${cell.cell_id} • ${formatPercent(detection.confidence)}`,
            note: detection.note,
            actions: detection.action_items,
          };
        }),
    );
}

function buildDetectionFeed() {
  const items = evidenceFeedItems();
  if (!items.length) {
    detectionFeed.innerHTML = `<p class="empty-state">No detections match the current filters.</p>`;
    return;
  }

  detectionFeed.innerHTML = items
    .map(
      (item) => `
        <article class="detection-card">
          <img src="${item.image}" alt="${item.title}" />
          <div class="detection-copy">
            <div class="species-topline">
              <span>${item.type === "photo" ? "Uploaded proof" : "Scan evidence"}</span>
              <strong>${item.title}</strong>
            </div>
            <p>${item.subtitle}</p>
            <p>${item.note}</p>
            <div class="tag-row">
              ${item.actions.map((action) => `<span class="tag action-tag">${action}</span>`).join("")}
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function buildSearchIndex() {
  const speciesEntries = speciesCatalogState.map((species) => ({
    label: species.common_name,
    value: species.common_name,
    kind: "species",
  }));
  const placeEntries = searchablePlacesState.map((place) => ({
    label: place.label,
    value: place.label,
    kind: place.kind,
    lat: place.lat,
    lon: place.lon,
    zoom: place.zoom,
  }));
  const sensorEntries = sensorProfilesState.map((profile) => ({
    label: profile.label,
    value: profile.label,
    kind: "station",
    lat: profile.coordinates[1],
    lon: profile.coordinates[0],
    zoom: 14,
  }));
  const sourceEntries = dataSourcesState.map((source) => ({
    label: source.name,
    value: source.name,
    kind: "source",
  }));
  const scanEntries = scanModelState.map((cell) => ({
    label: cell.cell_id,
    value: cell.cell_id,
    kind: "scan",
  }));

  searchIndex = [...speciesEntries, ...placeEntries, ...sensorEntries, ...sourceEntries, ...scanEntries];
  searchSuggestions.innerHTML = searchIndex.map((entry) => `<option value="${entry.value}"></option>`).join("");
}

function focusSearchTarget(entry) {
  if (!entry) {
    return;
  }

  if (entry.kind === "species") {
    activeSpeciesName = entry.value;
    activeCellId = habitatState.find((habitat) =>
      habitat.species_pressures.some((pressure) => pressure.common_name === activeSpeciesName),
    )?.cell_id || activeCellId;
    activateView("speciesView");
    buildNarrativeSummary();
    buildActionList();
    buildStressedSpeciesRail();
    buildSpeciesList();
    drawScanModel();
    drawMapLayers();
    buildExplanationPanel();
    buildDetectionFeed();
    return;
  }

  if (entry.kind === "scan") {
    activeCellId = entry.value;
    activeSpeciesName = findScanCell(entry.value)?.detections[0]?.species_name || activeSpeciesName;
    activateView("scanView");
    buildNarrativeSummary();
    buildActionList();
    buildHabitatList();
    buildSpeciesList();
    drawScanModel();
    drawMapLayers();
    buildExplanationPanel();
    buildDetectionFeed();
    return;
  }

  if (entry.kind === "source") {
    activateView("dataView");
    sourceList.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  activateView("scanView");
  if (map && entry.lat && entry.lon) {
    map.flyTo([entry.lat, entry.lon], entry.zoom || 13, { duration: 0.9 });
  }
}

function bindViewTabs() {
  viewTabs.forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.viewTarget));
  });
}

function bindSearch() {
  searchInput?.addEventListener("change", () => {
    const term = searchInput.value.trim().toLowerCase();
    const match = searchIndex.find((entry) => entry.value.toLowerCase() === term || entry.label.toLowerCase() === term);
    focusSearchTarget(match);
  });
}

function bindPhotoUpload() {
  photoUploadInput?.addEventListener("change", async (event) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }
    try {
      selectedPhotoFiles = [...files];
      const jobId = await createAnalysisJob();
      const result = await waitForJob(jobId);
      applyAnalysisResult(result);
      activateView("scanView");
    } catch (error) {
      renderError(`Unable to analyze uploaded photos: ${error.message}`);
    }
  });
}

function bindScanUpload() {
  scanUploadInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      selectedScanFile = file;
      const jobId = await createAnalysisJob();
      const result = await waitForJob(jobId);
      applyAnalysisResult(result);
      activateView("scanView");
    } catch (error) {
      renderError(`Unable to analyze uploaded scan: ${error.message}`);
    }
  });
}

function bindExportReport() {
  exportReportButton?.addEventListener("click", async () => {
    if (!currentJobId) {
      renderError("Generate an analysis job before exporting a report.");
      return;
    }
    try {
      const response = await fetch("/api/jobs/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id: currentJobId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Report export failed" }));
        throw new Error(error.error || `Report export failed with ${response.status}`);
      }
      const payload = await response.json();
      currentReportUrl = payload.report_url;
      window.open(currentReportUrl, "_blank", "noopener");
    } catch (error) {
      renderError(`Unable to export report: ${error.message}`);
    }
  });
}

async function loadDashboard() {
  const response = await fetch("/api/demo-biodiversity");
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const payload = await response.json();
  habitatState = payload.habitats || [];
  sensorState = payload.sensors || [];
  studyAreaState = payload.study_area;
  landmarkState = payload.landmarks || [];
  speciesCatalogState = payload.species_catalog || [];
  sensorProfilesState = payload.sensor_profiles || [];
  dataSourcesState = payload.data_sources || [];
  searchablePlacesState = payload.searchable_places || [];
  scanModelState = payload.scan_model || [];
  scanSummaryState = payload.scan_summary || null;
  detectorSummaryState = payload.detector_summary || null;

  activeCellId = habitatState[0]?.cell_id || null;
  activeSpeciesName = speciesCatalogState[0]?.common_name || null;
  setJobStatus("Idle");
  setJobProgress(0, "Waiting for uploads");

  buildSearchIndex();
  buildSummaryCards(payload.overview);
  buildHeroMetrics(payload.overview);
  buildNarrativeSummary();
  buildActionList();
  buildHabitatList();
  buildStressedSpeciesRail();
  buildSpeciesList();
  buildSensorList();
  buildSourceList();
  buildPhotoGallery();
  buildScanMetaPanel();
  buildModelStatusBanner();
  buildExplanationPanel();
  drawScanModel();
  buildDetectionFeed();
  drawMapLayers();
}

function renderError(message) {
  const markup = `<p class="empty-state">${message}</p>`;
  summaryCards.innerHTML = markup;
  habitatList.innerHTML = markup;
  narrativeSummary.innerHTML = markup;
  stressedSpeciesRail.innerHTML = markup;
  speciesList.innerHTML = markup;
  sensorList.innerHTML = markup;
  sourceList.innerHTML = markup;
  actionList.innerHTML = markup;
  scanViewport.innerHTML = markup;
  scanMetaPanel.innerHTML = markup;
  explanationPanel.innerHTML = markup;
  detectionFeed.innerHTML = markup;
  photoGallery.innerHTML = markup;
  setJobStatus("Error");
  setJobProgress(0, "Analysis failed");
}

bindViewTabs();
bindSearch();
bindPhotoUpload();
bindScanUpload();
bindExportReport();

loadDashboard().catch((error) => {
  renderError(`Unable to load EcoScan data: ${error.message}`);
});
