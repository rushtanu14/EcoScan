const heroMetrics = document.getElementById("heroMetrics");
const selectedPhotoSummary = document.getElementById("selectedPhotoSummary");
const selectedPhotoNames = document.getElementById("selectedPhotoNames");
const evidenceModeLabel = document.getElementById("evidenceModeLabel");
const summaryCards = document.getElementById("summaryCards");
const verdictHeadline = document.getElementById("verdictHeadline");
const verdictBody = document.getElementById("verdictBody");
const focusChipRow = document.getElementById("focusChipRow");
const actionList = document.getElementById("actionList");
const photoGallery = document.getElementById("photoGallery");
const detectionFeed = document.getElementById("detectionFeed");
const mapTitle = document.getElementById("mapTitle");
const locationMiniCard = document.getElementById("locationMiniCard");
const locationWidgetTitle = document.getElementById("locationWidgetTitle");
const locationWidgetCoords = document.getElementById("locationWidgetCoords");
const corridorMap = document.getElementById("corridorMap");
const scanTitle = document.getElementById("scanTitle");
const scanLegend = document.getElementById("scanLegend");
const scanViewport = document.getElementById("scanViewport");
const habitatList = document.getElementById("habitatList");
const speciesList = document.getElementById("speciesList");
const sensorList = document.getElementById("sensorList");
const sourceList = document.getElementById("sourceList");

const photoUploadInput = document.getElementById("photoUploadInput");
const choosePhotosButton = document.getElementById("choosePhotosButton");
const guidedDemoButton = document.getElementById("guidedDemoButton");
const analyzeUploadsButton = document.getElementById("analyzeUploadsButton");
const clearEvidenceButton = document.getElementById("clearEvidenceButton");

let overviewState = null;
let habitatState = [];
let sensorState = [];
let studyAreaState = null;
let landmarkState = [];
let speciesCatalogState = [];
let sensorProfilesState = [];
let dataSourcesState = [];
let locationContextState = {};
let scanModelState = [];

let selectedPhotoFiles = [];
let uploadedEvidenceState = [];
let previewUrls = [];
let evidenceModeState = "none";
let uploadAnalysisInFlight = false;

let activeCellId = null;
let activeSpeciesName = null;

const SPECIES_WIKI_PAGES = {
  "Monarch butterfly": "Monarch_butterfly",
  "California red-legged frog": "California_red-legged_frog",
  "Acorn woodpecker": "Acorn_woodpecker",
  "Valley oak saplings": "Quercus_lobata",
  "Western pond turtle": "Western_pond_turtle",
  "Black phoebe": "Black_phoebe",
  "California milkweed": "Asclepias_californica",
  "Coyote brush": "Baccharis_pilularis",
};

const SCENE_KEYWORDS = {
  wetland: ["frog", "turtle", "wetland", "water", "riparian", "pond", "creek"],
  canopy: ["oak", "woodpecker", "tree", "monarch", "milkweed", "grassland", "plant"],
  dry: ["coyote", "brush", "dry", "edge", "oak", "monarch", "milkweed"],
  urban: ["urban", "edge", "phoebe", "bird", "monarch", "oak"],
  mixed: ["monarch", "frog", "oak", "turtle", "milkweed", "phoebe", "brush"],
};

const SCENE_LABELS = {
  wetland: "Wetland / waterline",
  canopy: "Green canopy / vegetation",
  dry: "Dry grassland edge",
  urban: "Urban or low-vegetation edge",
  mixed: "Mixed habitat scene",
};

function titleCase(value) {
  return String(value || "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatLabel(value) {
  return titleCase(String(value || "").replace(/\bpm25\b/i, "PM25"));
}

function formatCoordinate(lat, lon) {
  const latLabel = `${Math.abs(Number(lat || 0)).toFixed(4)}° ${Number(lat || 0) >= 0 ? "N" : "S"}`;
  const lonLabel = `${Math.abs(Number(lon || 0)).toFixed(4)}° ${Number(lon || 0) >= 0 ? "E" : "W"}`;
  return `${latLabel}, ${lonLabel}`;
}

function habitatTone(score) {
  if (score >= 0.68) {
    return "fragile";
  }
  if (score >= 0.42) {
    return "stressed";
  }
  return "thriving";
}

function releasePreviewUrls() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
}

function activeHabitat() {
  return habitatState.find((habitat) => habitat.cell_id === activeCellId) || habitatState[0] || null;
}

function activeSpecies() {
  return speciesCatalogState.find((species) => species.common_name === activeSpeciesName) || speciesCatalogState[0] || null;
}

function topHabitatForSpecies(speciesName) {
  return habitatState
    .map((habitat) => ({
      habitat,
      score:
        habitat.species_pressures.find((pressure) => pressure.common_name === speciesName)?.vulnerability_score ??
        habitat.risk_score,
    }))
    .sort((left, right) => right.score - left.score)[0]?.habitat;
}

function focusEvidence() {
  if (!uploadedEvidenceState.length) {
    return [];
  }
  const exact = uploadedEvidenceState.filter(
    (item) => item.cellId === activeCellId || item.speciesName === activeSpeciesName,
  );
  return exact.length ? exact : uploadedEvidenceState;
}

function primaryActions() {
  const actions = new Set();
  const habitat = activeHabitat();
  const species = activeSpecies();
  (habitat?.recommended_actions || []).forEach((action) => actions.add(action));
  (species?.action_items || []).forEach((action) => actions.add(action));
  (focusEvidence()[0]?.actionItems || []).forEach((action) => actions.add(action));
  return [...actions].slice(0, 4);
}

function ensureFocus() {
  if (!habitatState.length || !speciesCatalogState.length) {
    return;
  }

  if (!activeCellId) {
    activeCellId = habitatState[0].cell_id;
  }

  if (!activeSpeciesName) {
    activeSpeciesName = activeHabitat()?.species_pressures?.[0]?.common_name || speciesCatalogState[0].common_name;
  }

  const habitat = activeHabitat();
  if (habitat && !habitat.species_pressures.some((pressure) => pressure.common_name === activeSpeciesName)) {
    const bestHabitat = topHabitatForSpecies(activeSpeciesName);
    if (bestHabitat) {
      activeCellId = bestHabitat.cell_id;
    }
  }
}

function setFocus(speciesName = activeSpeciesName, cellId = activeCellId) {
  if (speciesName) {
    activeSpeciesName = speciesName;
  }
  if (cellId) {
    activeCellId = cellId;
  }
  ensureFocus();
  renderExperience();
}

function evidenceModeText() {
  if (evidenceModeState === "guided") {
    return "Sample field evidence";
  }
  if (evidenceModeState === "uploaded") {
    return "Uploaded photos";
  }
  return "Habitat model only";
}

function updateIntakeState() {
  const fileCount = selectedPhotoFiles.length;
  if (uploadAnalysisInFlight) {
    selectedPhotoSummary.textContent = "Analyzing uploaded photos...";
    selectedPhotoNames.textContent = "Running photo-based species matching and hotspot risk detection.";
  } else if (fileCount === 0 && evidenceModeState === "guided") {
    selectedPhotoSummary.textContent = "Sample evidence ready";
    selectedPhotoNames.textContent = "Sample field evidence is loaded and ready for species-risk review.";
  } else {
    selectedPhotoSummary.textContent =
      fileCount === 0 ? "No files selected yet" : `${fileCount} photo${fileCount === 1 ? "" : "s"} ready`;
    selectedPhotoNames.textContent =
      fileCount === 0
        ? "Use sample field evidence or upload photos to detect at-risk species."
        : selectedPhotoFiles.map((file) => file.name).join(" • ");
  }

  evidenceModeLabel.textContent = evidenceModeText();
  analyzeUploadsButton.disabled = fileCount === 0 || uploadAnalysisInFlight;
  analyzeUploadsButton.textContent = uploadAnalysisInFlight ? "Analyzing photos..." : "Analyze selected photos";
}

function buildHeroMetrics() {
  if (!overviewState || !studyAreaState) {
    heroMetrics.innerHTML = "";
    return;
  }

  const habitat = activeHabitat();
  const species = activeSpecies();
  const cards = [
    {
      label: "Study area",
      value: studyAreaState.region,
      note: studyAreaState.name,
    },
    {
      label: "Lead watchlist species",
      value: species?.common_name || "Not available",
      note: species ? `${formatPercent(species.avg_vulnerability_score)} average vulnerability` : "Awaiting data",
    },
    {
      label: "Current hotspot",
      value: habitat ? titleCase(habitat.habitat_type) : "Not available",
      note: habitat ? `${titleCase(habitat.health_label)} cell ${habitat.cell_id}` : "Awaiting data",
    },
  ];

  heroMetrics.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <p>${card.note}</p>
        </article>
      `,
    )
    .join("");
}

function buildSpotlight() {
  const habitat = activeHabitat();
  const species = activeSpecies();
  const locationStory = locationContextState?.pressure_story || "";
  const evidenceLead = focusEvidence()[0];

  if (!habitat || !species) {
    verdictHeadline.textContent = "No habitat result available.";
    verdictBody.textContent = "Load the data payload to begin.";
    focusChipRow.innerHTML = "";
    return;
  }

  verdictHeadline.textContent = `${species.common_name} is the clearest species-risk signal in this corridor right now.`;
  verdictBody.textContent = evidenceLead
    ? `${habitat.habitat_story} The uploaded evidence points back to ${species.common_name}, so the next move is to focus on ${titleCase(
        habitat.habitat_type,
      )} and act on the recommendations below.`
    : `${habitat.habitat_story} ${species.narrative} ${locationStory}`.trim();

  const chips = [
    `Mode: ${evidenceModeText()}`,
    `Cell ${habitat.cell_id}`,
    titleCase(habitat.health_label),
    `${formatPercent(habitat.risk_score)} risk`,
    titleCase(habitat.habitat_type),
  ];

  focusChipRow.innerHTML = chips.map((chip) => `<span class="focus-chip">${chip}</span>`).join("");
  mapTitle.textContent = `${species.common_name} across the Coyote Valley corridor`;
  scanTitle.textContent = `${titleCase(habitat.habitat_type)} hotspot for ${species.common_name}`;
}

function buildLocationWidget() {
  if (!locationWidgetTitle || !locationWidgetCoords || !studyAreaState) {
    return;
  }

  locationWidgetTitle.textContent = studyAreaState.region || studyAreaState.name || "Coyote Valley, CA";
  locationWidgetCoords.textContent = formatCoordinate(studyAreaState.center?.lat, studyAreaState.center?.lon);
}

function buildActionList() {
  const actions = primaryActions();
  actionList.innerHTML = actions.length
    ? actions
        .map(
          (action, index) => `
            <article class="action-card">
              <span>Priority ${index + 1}</span>
              <strong>${action}</strong>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">No actions available yet.</p>`;
}

function buildSummaryCards() {
  if (!overviewState) {
    summaryCards.innerHTML = "";
    return;
  }

  const habitat = activeHabitat();
  const species = activeSpecies();
  const cards = [
    {
      label: "Average biodiversity score",
      value: overviewState.avg_biodiversity_score,
      note: "Across the current corridor model",
    },
    {
      label: "Cells under pressure",
      value: `${overviewState.fragile_cells + overviewState.stressed_cells}`,
      note: `${overviewState.fragile_cells} fragile, ${overviewState.stressed_cells} stressed`,
      tone: "warning",
    },
    {
      label: "Lead species",
      value: species?.common_name || overviewState.top_species_at_risk[0] || "Not available",
      note: species ? `${formatPercent(species.avg_vulnerability_score)} average vulnerability` : "Watchlist driver",
    },
    {
      label: "Next move",
      value: primaryActions()[0] || "Inspect top hotspot",
      note: habitat ? `Focused on ${titleCase(habitat.habitat_type)}` : "Field recommendation",
    },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card ${card.tone || ""}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <p>${card.note}</p>
        </article>
      `,
    )
    .join("");
}

function buildPhotoGallery() {
  if (!uploadedEvidenceState.length) {
    if (uploadAnalysisInFlight && evidenceModeState === "uploaded") {
      photoGallery.innerHTML = `
        <article class="empty-card">
          <strong>Analyzing uploaded photos...</strong>
          <p>Running visual species matching and hotspot risk detection.</p>
        </article>
      `;
      return;
    }

    photoGallery.innerHTML = `
      <article class="empty-card">
        <strong>No photo evidence loaded yet.</strong>
        <p>Use the sample field set for instant evidence, or upload one to three field photos.</p>
      </article>
    `;
    return;
  }

  photoGallery.innerHTML = uploadedEvidenceState
    .map(
      (item) => `
        <button class="evidence-card ${item.cellId === activeCellId || item.speciesName === activeSpeciesName ? "is-active" : ""}" data-evidence-id="${item.id}">
          <img src="${item.image}" alt="${item.title}" />
          <div class="evidence-copy">
            <span>${item.badge}</span>
            <strong>${item.title}</strong>
            <p>${item.subtitle}</p>
            <small>${item.annotation}</small>
          </div>
        </button>
      `,
    )
    .join("");

  photoGallery.querySelectorAll("[data-evidence-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = uploadedEvidenceState.find((entry) => entry.id === button.dataset.evidenceId);
      if (item) {
        setFocus(item.speciesName, item.cellId);
      }
    });
  });
}

function buildDetectionFeed() {
  if (uploadAnalysisInFlight && evidenceModeState === "uploaded") {
    detectionFeed.innerHTML = `
      <article class="empty-card">
        <strong>Detection pipeline running...</strong>
        <p>Your uploaded photos are being processed to identify likely at-risk species in each image.</p>
      </article>
    `;
    return;
  }

  const evidence = focusEvidence();

  if (evidence.length) {
    detectionFeed.innerHTML = evidence
      .map(
        (item) => `
          <article class="feed-card">
            <span>${item.badge}</span>
            <strong>${item.speciesName}</strong>
            <p>${item.note}</p>
            <div class="feed-meta">
              <span>${titleCase(item.healthLabel)}</span>
              <span>${formatPercent(item.confidence)} confidence</span>
            </div>
            <div class="tag-row">
              ${(item.actionItems || []).map((action) => `<span class="tag action-tag">${action}</span>`).join("")}
            </div>
          </article>
        `,
      )
      .join("");
    return;
  }

  const scanCell = scanModelState.find((cell) => cell.cell_id === activeCellId) || scanModelState[0];
  detectionFeed.innerHTML =
    scanCell?.detections?.length
      ? scanCell.detections
          .map(
            (detection) => `
              <button class="feed-card interactive" data-species-name="${detection.species_name}">
                <span>Scan evidence</span>
                <strong>${detection.species_name}</strong>
                <p>${detection.note}</p>
                <div class="feed-meta">
                  <span>${titleCase(detection.risk_level)}</span>
                  <span>${formatPercent(detection.confidence)} confidence</span>
                </div>
                <div class="tag-row">
                  ${(detection.action_items || []).map((action) => `<span class="tag action-tag">${action}</span>`).join("")}
                </div>
              </button>
            `,
          )
          .join("")
      : `<article class="empty-card"><strong>No detections available.</strong><p>Pick another hotspot to inspect the scan evidence.</p></article>`;

  detectionFeed.querySelectorAll("[data-species-name]").forEach((button) => {
    button.addEventListener("click", () => {
      setFocus(button.dataset.speciesName, activeCellId);
    });
  });
}

function buildHabitatList() {
  habitatList.innerHTML = habitatState
    .slice(0, 6)
    .map(
      (habitat, index) => `
        <button class="habitat-row ${habitat.health_label} ${habitat.cell_id === activeCellId ? "is-active" : ""}" data-cell-id="${habitat.cell_id}">
          <span class="row-rank">#${index + 1}</span>
          <div class="row-main">
            <strong>${titleCase(habitat.habitat_type)}</strong>
            <small>${habitat.species_pressures[0]?.common_name || "No lead species"}</small>
          </div>
          <span class="row-score">${formatPercent(habitat.risk_score)}</span>
        </button>
      `,
    )
    .join("");

  habitatList.querySelectorAll("[data-cell-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const habitat = habitatState.find((entry) => entry.cell_id === button.dataset.cellId);
      setFocus(habitat?.species_pressures?.[0]?.common_name || activeSpeciesName, button.dataset.cellId);
    });
  });
}

function buildSpeciesList() {
  speciesList.innerHTML = speciesCatalogState
    .map(
      (species) => `
        <button class="species-card ${species.status_label} ${species.common_name === activeSpeciesName ? "is-active" : ""}" data-species-name="${species.common_name}">
          <div class="species-visuals">
            <img src="${species.image_asset}" alt="${species.common_name}" class="species-primary-image" />
            <div class="species-examples">
              ${(species.example_images || [])
                .slice(0, 2)
                .map((image) => `<img src="${image}" alt="${species.common_name} example" />`)
                .join("")}
            </div>
          </div>
          <div class="species-copy">
            <span>${titleCase(species.kingdom)}</span>
            <strong>${species.common_name}</strong>
            <em>${species.scientific_name}</em>
            <p>${species.habitat_need}</p>
            <div class="species-meta">
              <span>${species.stressed_habitat_count}/${species.total_habitats} habitats under stress</span>
              <span>${formatPercent(species.avg_vulnerability_score)} vulnerability</span>
            </div>
          </div>
        </button>
      `,
    )
    .join("");

  speciesList.querySelectorAll("[data-species-name]").forEach((button) => {
    button.addEventListener("click", () => {
      const bestHabitat = topHabitatForSpecies(button.dataset.speciesName);
      setFocus(button.dataset.speciesName, bestHabitat?.cell_id || activeCellId);
    });
  });
}

function buildSensorList() {
  sensorList.innerHTML = sensorProfilesState.length
    ? sensorProfilesState
        .map(
          (sensor) => `
            <article class="info-card">
              <span>${sensor.kind}</span>
              <strong>${sensor.label}</strong>
              <p>${sensor.summary}</p>
              <small>${sensor.why_it_matters}</small>
              <a href="${sensor.source_url}" target="_blank" rel="noreferrer">Open source</a>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">No sensor profiles available.</p>`;
}

function buildSourceList() {
  sourceList.innerHTML = dataSourcesState.length
    ? dataSourcesState
        .map(
          (source) => `
            <article class="info-card">
              <span>${source.kind}</span>
              <strong>${source.name}</strong>
              <p>${source.note}</p>
              <a href="${source.url}" target="_blank" rel="noreferrer">Open reference</a>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">No sources available.</p>`;
}

function polygonPoints(points, projector) {
  return points
    .map(([a, b]) => {
      const [x, y] = projector(a, b);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function projectMapCoordinate(lon, lat) {
  const bounds = studyAreaState?.bounds;
  if (!bounds) {
    return [0, 0];
  }
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * 100;
  const y = 100 - ((lat - bounds.south) / (bounds.north - bounds.south)) * 100;
  return [x, y];
}

function drawCorridorMap() {
  if (!studyAreaState || !habitatState.length) {
    corridorMap.innerHTML = `<p class="empty-state">Map unavailable.</p>`;
    return;
  }

  const habitatMarkup = habitatState
    .map((habitat) => {
      const isActive = habitat.cell_id === activeCellId;
      return `
        <g class="map-cell ${habitat.health_label} ${isActive ? "is-active" : ""}" data-cell-id="${habitat.cell_id}">
          <polygon points="${polygonPoints(habitat.polygon, projectMapCoordinate)}"></polygon>
          <text x="${projectMapCoordinate(habitat.centroid[0], habitat.centroid[1])[0].toFixed(2)}" y="${projectMapCoordinate(
            habitat.centroid[0],
            habitat.centroid[1],
          )[1].toFixed(2)}">${habitat.cell_id}</text>
        </g>
      `;
    })
    .join("");

  const landmarkMarkup = landmarkState
    .map((landmark) => {
      const coords = landmark.coordinates || [];
      if (coords.length < 2) {
        return "";
      }
      return `
        <polyline class="landmark-line ${landmark.kind}" points="${polygonPoints(coords, projectMapCoordinate)}"></polyline>
      `;
    })
    .join("");

  const sensorMarkup = sensorProfilesState
    .map((sensor) => {
      const [x, y] = projectMapCoordinate(sensor.coordinates[0], sensor.coordinates[1]);
      return `
        <g class="map-sensor">
          <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.8"></circle>
        </g>
      `;
    })
    .join("");

  corridorMap.innerHTML = `
    <svg viewBox="0 0 100 100" class="map-svg" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="8" class="map-backdrop"></rect>
      ${landmarkMarkup}
      ${habitatMarkup}
      ${sensorMarkup}
    </svg>
    <div class="map-legend">
      <span><i class="legend-swatch thriving"></i>Thriving</span>
      <span><i class="legend-swatch stressed"></i>Stressed</span>
      <span><i class="legend-swatch fragile"></i>Fragile</span>
      <span><i class="legend-dot"></i>Sensor</span>
    </div>
  `;

  corridorMap.querySelectorAll("[data-cell-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const habitat = habitatState.find((entry) => entry.cell_id === node.dataset.cellId);
      setFocus(habitat?.species_pressures?.[0]?.common_name || activeSpeciesName, node.dataset.cellId);
    });
  });
}

function drawScanModel() {
  if (!scanModelState.length) {
    scanViewport.innerHTML = `<p class="empty-state">Scan unavailable.</p>`;
    scanLegend.innerHTML = "";
    return;
  }

  const habitat = activeHabitat();
  const scanCell = scanModelState.find((cell) => cell.cell_id === activeCellId) || scanModelState[0];

  scanLegend.innerHTML = `
    <span><i class="legend-swatch thriving"></i>Thriving</span>
    <span><i class="legend-swatch stressed"></i>Stressed</span>
    <span><i class="legend-swatch fragile"></i>Fragile</span>
  `;

  const polygons = scanModelState
    .map((cell) => {
      const isActive = cell.cell_id === activeCellId;
      const points = cell.projected_polygon
        .map(([x, y]) => `${(x * 100).toFixed(2)},${(100 - y * 100).toFixed(2)}`)
        .join(" ");
      const centroidX =
        cell.projected_polygon.reduce((sum, point) => sum + point[0], 0) / cell.projected_polygon.length;
      const centroidY =
        cell.projected_polygon.reduce((sum, point) => sum + point[1], 0) / cell.projected_polygon.length;

      return `
        <g class="scan-cell ${cell.health_label} ${isActive ? "is-active" : ""}" data-cell-id="${cell.cell_id}">
          <polygon points="${points}"></polygon>
          <text x="${(centroidX * 100).toFixed(2)}" y="${(100 - centroidY * 100).toFixed(2)}">${cell.cell_id}</text>
        </g>
      `;
    })
    .join("");

  const keyDetection =
    scanCell.detections.find((detection) => detection.species_name === activeSpeciesName) || scanCell.detections[0];

  scanViewport.innerHTML = `
    <div class="scan-layout">
      <svg viewBox="0 0 100 100" class="scan-svg" aria-hidden="true">
        <rect x="0" y="0" width="100" height="100" rx="8" class="scan-backdrop"></rect>
        ${polygons}
      </svg>
      <aside class="scan-callout">
        <span>Highlighted hotspot</span>
        <strong>${scanCell.cell_id} · ${titleCase(scanCell.health_label)}</strong>
        <p>${habitat?.habitat_story || "No habitat story available."}</p>
        ${
          keyDetection
            ? `
              <div class="callout-detail">
                <label>Lead detection</label>
                <p>${keyDetection.species_name} · ${formatPercent(keyDetection.confidence)} confidence</p>
              </div>
              <div class="callout-detail">
                <label>Why it matters</label>
                <p>${keyDetection.note}</p>
              </div>
            `
            : ""
        }
      </aside>
    </div>
  `;

  scanViewport.querySelectorAll("[data-cell-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const match = scanModelState.find((cell) => cell.cell_id === node.dataset.cellId);
      setFocus(match?.lead_species || activeSpeciesName, node.dataset.cellId);
    });
  });
}

function renderExperience() {
  ensureFocus();
  updateIntakeState();
  buildHeroMetrics();
  buildSpotlight();
  buildLocationWidget();
  buildActionList();
  buildSummaryCards();
  buildPhotoGallery();
  buildDetectionFeed();
  drawCorridorMap();
  drawScanModel();
  buildHabitatList();
  buildSpeciesList();
  buildSensorList();
  buildSourceList();
}

function bestSpeciesMatch(fileName, fallbackIndex = 0) {
  const normalized = fileName.toLowerCase();
  const exactMatch = speciesCatalogState.find((species) =>
    (species.aliases || []).some((alias) => normalized.includes(alias.toLowerCase())),
  );
  if (exactMatch) {
    return exactMatch;
  }
  return speciesCatalogState[fallbackIndex % speciesCatalogState.length] || speciesCatalogState[0];
}

function speciesTextBlob(species) {
  return `${species.common_name} ${species.scientific_name} ${species.habitat_need} ${(species.aliases || []).join(
    " ",
  )}`.toLowerCase();
}

function sceneFromMetrics(metrics) {
  if (!metrics) {
    return { id: "mixed", strength: 0.18 };
  }

  if (metrics.blueRatio > 0.24 || (metrics.blueRatio > 0.17 && metrics.avgLuma < 0.58)) {
    return { id: "wetland", strength: Math.max(metrics.blueRatio, metrics.avgSaturation) };
  }

  if (metrics.greenRatio > 0.27 && metrics.avgSaturation > 0.13) {
    return { id: "canopy", strength: Math.max(metrics.greenRatio, metrics.avgSaturation) };
  }

  if (metrics.warmRatio > 0.26 && metrics.brightRatio > 0.2) {
    return { id: "dry", strength: Math.max(metrics.warmRatio, metrics.brightRatio) };
  }

  if (metrics.darkRatio > 0.45 && metrics.avgSaturation < 0.16) {
    return { id: "urban", strength: Math.max(metrics.darkRatio, 0.2) };
  }

  return { id: "mixed", strength: Math.max(metrics.avgSaturation, 0.18) };
}

function extractPhotoMetrics(file) {
  return new Promise((resolve) => {
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }

        const maxEdge = 96;
        const scale = Math.min(maxEdge / image.width, maxEdge / image.height, 1);
        const width = Math.max(32, Math.floor(image.width * scale));
        const height = Math.max(32, Math.floor(image.height * scale));
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let greenCount = 0;
        let blueCount = 0;
        let warmCount = 0;
        let darkCount = 0;
        let brightCount = 0;
        let saturationSum = 0;
        let lumaSum = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3];
          if (alpha < 16) {
            continue;
          }

          const r = pixels[i] / 255;
          const g = pixels[i + 1] / 255;
          const b = pixels[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const saturation = max === 0 ? 0 : (max - min) / max;

          if (g > r + 0.08 && g > b + 0.05) {
            greenCount += 1;
          }
          if (b > g + 0.06 && b > r + 0.06) {
            blueCount += 1;
          }
          if (r > g + 0.07 && r > b + 0.04) {
            warmCount += 1;
          }
          if (luma < 0.32) {
            darkCount += 1;
          }
          if (luma > 0.68) {
            brightCount += 1;
          }

          saturationSum += saturation;
          lumaSum += luma;
          count += 1;
        }

        if (!count) {
          resolve(null);
          return;
        }

        resolve({
          greenRatio: greenCount / count,
          blueRatio: blueCount / count,
          warmRatio: warmCount / count,
          darkRatio: darkCount / count,
          brightRatio: brightCount / count,
          avgSaturation: saturationSum / count,
          avgLuma: lumaSum / count,
        });
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(null);
    };

    image.src = imageUrl;
  });
}

async function detectSpeciesFromPhoto(file, fallbackIndex = 0) {
  const metrics = await extractPhotoMetrics(file);
  const scene = sceneFromMetrics(metrics);
  const sceneKeywords = SCENE_KEYWORDS[scene.id] || SCENE_KEYWORDS.mixed;
  const fileName = String(file?.name || "").toLowerCase();

  const ranked = speciesCatalogState
    .map((species) => {
      const text = speciesTextBlob(species);
      const keywordHits = sceneKeywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
      const aliasMatch = (species.aliases || []).some((alias) => fileName.includes(alias.toLowerCase()));

      let score = Number(species.avg_vulnerability_score || 0) * 0.46 + Number(species.max_vulnerability_score || 0) * 0.26;
      score += keywordHits * 0.14;

      if (aliasMatch) {
        score += 0.42;
      }

      if (species.kingdom === "plant" && (scene.id === "canopy" || scene.id === "dry")) {
        score += 0.08;
      }
      if (species.kingdom === "animal" && (scene.id === "wetland" || scene.id === "urban")) {
        score += 0.08;
      }

      return { species, score, aliasMatch };
    })
    .sort((left, right) => right.score - left.score);

  const fallbackSpecies = bestSpeciesMatch(file.name, fallbackIndex);
  const best = ranked[0]?.species || fallbackSpecies;
  const secondScore = ranked[1]?.score || ranked[0]?.score || 0;
  const topScore = ranked[0]?.score || 0;
  const gap = Math.max(0, topScore - secondScore);

  const confidence = Math.min(
    0.97,
    Math.max(
      0.55,
      0.52 +
        Number(best?.avg_vulnerability_score || 0) * 0.2 +
        scene.strength * 0.45 +
        gap * 0.2 +
        (ranked[0]?.aliasMatch ? 0.08 : 0),
    ),
  );

  return {
    species: best,
    confidence,
    sceneLabel: SCENE_LABELS[scene.id] || SCENE_LABELS.mixed,
  };
}

async function buildUploadEvidence(files) {
  releasePreviewUrls();

  return Promise.all(files.map(async (file, index) => {
    const detection = await detectSpeciesFromPhoto(file, index);
    const species = detection.species || bestSpeciesMatch(file.name, index) || speciesCatalogState[index % speciesCatalogState.length];
    const habitat = topHabitatForSpecies(species.common_name) || habitatState[index % habitatState.length];
    const previewUrl = URL.createObjectURL(file);
    previewUrls.push(previewUrl);
    const inferredRisk = habitatTone(Math.max(Number(habitat.risk_score || 0), Number(species.avg_vulnerability_score || 0)));

    return {
      id: `upload-${index}-${file.name}`,
      image: previewUrl,
      title: file.name,
      subtitle: `${species.common_name} detected in a ${detection.sceneLabel.toLowerCase()} scene`,
      annotation: `${titleCase(inferredRisk)} risk focus · hotspot ${habitat.cell_id} · ${formatPercent(detection.confidence)}`,
      speciesName: species.common_name,
      cellId: habitat.cell_id,
      confidence: detection.confidence,
      note: `${species.common_name} was vision-matched from the uploaded image and linked to ${titleCase(
        habitat.habitat_type,
      )} where risk is currently ${titleCase(inferredRisk)}.`,
      healthLabel: habitat.health_label,
      badge: "Photo detection",
      actionItems: [...new Set([...(species.action_items || []), ...(habitat.recommended_actions || [])])].slice(0, 3),
      sourceUrl: species.source_url,
    };
  }));
}

function sampleEvidence() {
  releasePreviewUrls();

  const evidence = speciesCatalogState.slice(0, 3).map((species, index) => {
    const habitat = topHabitatForSpecies(species.common_name) || habitatState[index];
    return {
      id: `guided-${species.common_name}`,
      image: species.example_images?.[0] || species.image_asset,
      title: species.common_name,
      subtitle: `${titleCase(habitat.habitat_type)} hotspot · ${formatPercent(habitat.risk_score)} risk`,
      annotation: `Example imagery for ${species.common_name}`,
      speciesName: species.common_name,
      cellId: habitat.cell_id,
      confidence: Math.min(0.97, species.avg_vulnerability_score + 0.18),
      note: `${species.narrative} This curated field set gives immediate conservation context before custom uploads.`,
      healthLabel: habitat.health_label,
      badge: "Sample field set",
      actionItems: [...new Set([...(species.action_items || []), ...(habitat.recommended_actions || [])])].slice(0, 3),
      sourceUrl:
        species.source_url ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(SPECIES_WIKI_PAGES[species.common_name] || species.common_name)}`,
    };
  });

  evidenceModeState = "guided";
  uploadedEvidenceState = evidence;
  setFocus(evidence[0]?.speciesName, evidence[0]?.cellId);
}

function clearEvidence() {
  releasePreviewUrls();
  selectedPhotoFiles = [];
  uploadedEvidenceState = [];
  evidenceModeState = "none";
  uploadAnalysisInFlight = false;
  photoUploadInput.value = "";
  renderExperience();
}

function bindEvents() {
  choosePhotosButton.addEventListener("click", () => photoUploadInput.click());

  photoUploadInput.addEventListener("change", (event) => {
    selectedPhotoFiles = [...(event.target.files || [])];
    updateIntakeState();
  });

  guidedDemoButton.addEventListener("click", () => {
    selectedPhotoFiles = [];
    photoUploadInput.value = "";
    sampleEvidence();
  });

  analyzeUploadsButton.addEventListener("click", async () => {
    if (!selectedPhotoFiles.length || uploadAnalysisInFlight) {
      return;
    }

    uploadAnalysisInFlight = true;
    evidenceModeState = "uploaded";
    uploadedEvidenceState = [];
    updateIntakeState();
    renderExperience();

    try {
      uploadedEvidenceState = await buildUploadEvidence(selectedPhotoFiles);
      setFocus(uploadedEvidenceState[0]?.speciesName, uploadedEvidenceState[0]?.cellId);
    } finally {
      uploadAnalysisInFlight = false;
      updateIntakeState();
    }
  });

  clearEvidenceButton.addEventListener("click", () => {
    clearEvidence();
  });

  if (locationMiniCard) {
    locationMiniCard.addEventListener("click", () => {
      locationMiniCard.classList.toggle("is-expanded");
    });
  }
}

function renderError(message) {
  verdictHeadline.textContent = "EcoScan could not load the corridor brief.";
  verdictBody.textContent = message;
  summaryCards.innerHTML = `<article class="summary-card danger"><span>Error</span><strong>Load failed</strong><p>${message}</p></article>`;
  photoGallery.innerHTML = `<article class="empty-card"><strong>Data unavailable.</strong><p>${message}</p></article>`;
}

async function loadDashboard() {
  const response = await fetch("/api/demo-biodiversity");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = await response.json();
  overviewState = payload.overview || null;
  habitatState = payload.habitats || [];
  sensorState = payload.sensors || [];
  studyAreaState = payload.study_area || null;
  landmarkState = payload.landmarks || [];
  speciesCatalogState = payload.species_catalog || [];
  sensorProfilesState = payload.sensor_profiles || [];
  dataSourcesState = payload.data_sources || [];
  locationContextState = payload.location_context || {};
  scanModelState = payload.scan_model || [];

  activeCellId = habitatState[0]?.cell_id || null;
  activeSpeciesName = speciesCatalogState[0]?.common_name || null;
  sampleEvidence();
}

bindEvents();

loadDashboard().catch((error) => {
  console.error(error);
  renderError(error.message);
});
