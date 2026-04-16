const summaryCards = document.getElementById("summaryCards");
const heroMetrics = document.getElementById("heroMetrics");
const habitatList = document.getElementById("habitatList");
const narrativeSummary = document.getElementById("narrativeSummary");
const stressedSpeciesRail = document.getElementById("stressedSpeciesRail");
const speciesList = document.getElementById("speciesList");
const sensorList = document.getElementById("sensorList");
const sourceList = document.getElementById("sourceList");
const mapTitle = document.getElementById("mapTitle");

const viewTabs = [...document.querySelectorAll("[data-view-target]")];
const views = [...document.querySelectorAll(".dashboard-view")];

let habitatState = [];
let sensorState = [];
let studyAreaState = null;
let landmarkState = [];
let speciesCatalogState = [];
let sensorProfilesState = [];
let dataSourcesState = [];
let activeCellId = null;
let activeSensorId = null;
let activeSpeciesName = null;

let map = null;
let habitatLayerGroup = null;
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

function findSpeciesByName(name) {
  return speciesCatalogState.find((species) => species.common_name === name);
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

function activateView(targetId) {
  viewTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === targetId);
  });
  views.forEach((view) => {
    view.classList.toggle("is-active", view.id === targetId);
  });
}

function bindViewTabs() {
  viewTabs.forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.viewTarget));
  });
}

function buildSummaryCards(overview) {
  const cards = [
    { label: "Average biodiversity score", value: `${overview.avg_biodiversity_score}` },
    { label: "Fragile habitats", value: `${overview.fragile_cells}`, className: "danger" },
    { label: "Stressed habitats", value: `${overview.stressed_cells}`, className: "warning" },
    { label: "Lead stressed species", value: overview.top_species_at_risk[0] || "N/A" },
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
  const leadSpecies = findSpeciesByName(overview.top_species_at_risk[0]);
  const actions = overview.priority_actions.slice(0, 2);

  heroMetrics.innerHTML = `
    <article class="metric-pill">
      <span>Study area</span>
      <strong>${studyAreaState.region}</strong>
      <p>${studyAreaState.name}</p>
    </article>
    <article class="metric-pill">
      <span>Lead stressed species</span>
      <strong>${leadSpecies ? leadSpecies.common_name : "N/A"}</strong>
      <p>${leadSpecies ? leadSpecies.habitat_need : "Waiting for species rollup."}</p>
    </article>
    <article class="metric-pill">
      <span>Lead action</span>
      <strong>${actions.length}</strong>
      <p>${actions[0] || "No action identified yet."}</p>
    </article>
  `;
}

function buildNarrativeSummary(overview) {
  const leadHabitat = habitatState[0];
  const leadSpecies = leadHabitat?.species_pressures?.[0];
  narrativeSummary.innerHTML = `
    <article class="summary-story">
      <p class="panel-label">Lead signal</p>
      <h3>${leadSpecies ? leadSpecies.common_name : "No species found"}</h3>
      <p>${leadHabitat ? leadHabitat.habitat_story : "No habitat summary yet."}</p>
      <p><strong>Stressors:</strong> ${(leadHabitat?.key_signals || []).map(titleCase).join(", ")}</p>
      <p><strong>Action:</strong> ${overview.priority_actions[0] || "No intervention available."}</p>
    </article>
  `;
}

function buildHabitatList() {
  habitatList.innerHTML = habitatState
    .slice(0, 6)
    .map((habitat, index) => `
      <button class="habitat-row ${habitat.health_label} ${habitat.cell_id === activeCellId ? "is-active" : ""}" data-cell-id="${habitat.cell_id}">
        <span class="row-rank">#${index + 1}</span>
        <span class="row-main">
          <strong>${titleCase(habitat.habitat_type)}</strong>
          <small>${habitat.species_pressures[0].common_name}</small>
        </span>
        <span class="row-score">${Math.round(habitat.biodiversity_score)}</span>
      </button>
    `)
    .join("");

  habitatList.querySelectorAll(".habitat-row").forEach((button) => {
    button.addEventListener("click", () => {
      activeCellId = button.dataset.cellId;
      activeSensorId = null;
      activateView("mapView");
      drawMapLayers();
    });
  });
}

function buildStressedSpeciesRail() {
  stressedSpeciesRail.innerHTML = speciesCatalogState
    .slice(0, 5)
    .map((species) => `
      <button class="rail-species ${species.status_label} ${species.common_name === activeSpeciesName ? "is-active" : ""}" data-species-name="${species.common_name}">
        <span>${species.common_name}</span>
        <strong>${formatPercent(species.avg_vulnerability_score)}</strong>
      </button>
    `)
    .join("");

  stressedSpeciesRail.querySelectorAll(".rail-species").forEach((button) => {
    button.addEventListener("click", () => {
      activeSpeciesName = button.dataset.speciesName;
      activateView("speciesView");
      drawMapLayers();
      buildStressedSpeciesRail();
      buildSpeciesList();
    });
  });
}

function buildSpeciesList() {
  speciesList.innerHTML = speciesCatalogState
    .map((species) => `
      <article class="species-item species-card ${species.status_label} ${species.common_name === activeSpeciesName ? "is-active" : ""}" data-species-name="${species.common_name}">
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
        <div class="detail-stat">
          <span>Habitat need</span>
          <strong>${species.habitat_need}</strong>
        </div>
        <div>
          <p class="panel-label">Pressure factors</p>
          <div class="tag-row">
            ${species.pressure_factors.map((factor) => `<span class="tag">${titleCase(factor)}</span>`).join("")}
          </div>
        </div>
        <div class="source-link">
          <a href="${species.source_url}" target="_blank" rel="noreferrer">Open pressure reference</a>
        </div>
      </article>
    `)
    .join("");

  speciesList.querySelectorAll(".species-item").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }
      activeSpeciesName = button.dataset.speciesName;
      drawMapLayers();
      buildStressedSpeciesRail();
      buildSpeciesList();
    });
  });
}

function buildMapHeader() {
  mapTitle.textContent = `${studyAreaState.name} map`;
}

function styleColorForHealth(label) {
  if (label === "fragile") {
    return "#7f5547";
  }
  if (label === "stressed") {
    return "#a67b5b";
  }
  return "#738771";
}

function habitatMatchesSpecies(habitat) {
  if (!activeSpeciesName) {
    return true;
  }
  return habitat.species_pressures.some((pressure) => pressure.common_name === activeSpeciesName);
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
  sensorLayerGroup = window.L.layerGroup().addTo(map);
  landmarkLayerGroup = window.L.layerGroup().addTo(map);

  const bounds = studyAreaState.bounds;
  map.fitBounds([
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ]);
}

function drawLandmarks() {
  landmarkLayerGroup.clearLayers();
  landmarkState.forEach((landmark) => {
    const latLngs = landmark.coordinates.map(([lon, lat]) => [lat, lon]);
    if (landmark.kind === "waterway") {
      window.L.polyline(latLngs, {
        color: "#718692",
        weight: 4,
        opacity: 0.9,
      })
        .bindTooltip(landmark.name)
        .addTo(landmarkLayerGroup);
      return;
    }

    window.L.polygon(latLngs, {
      color: "rgba(75, 63, 55, 0.45)",
      weight: 1,
      fillColor: landmark.kind === "urban_edge" ? "#b99277" : "#adb89e",
      fillOpacity: landmark.kind === "urban_edge" ? 0.2 : 0.14,
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
        <p>Leaflet could not load, so the real Coyote Valley map is unavailable in this browser session.</p>
      </div>
    `;
    return;
  }

  ensureMap();
  habitatLayerGroup.clearLayers();
  sensorLayerGroup.clearLayers();
  drawLandmarks();

  habitatState.forEach((habitat) => {
    const leadPressure = activeSpeciesName
      ? habitat.species_pressures.find((pressure) => pressure.common_name === activeSpeciesName)
      : habitat.species_pressures[0];
    const emphasis = habitatMatchesSpecies(habitat);
    const polygon = window.L.polygon(
      habitat.polygon.map(([lon, lat]) => [lat, lon]),
      {
        color: styleColorForHealth(habitat.health_label),
        weight: habitat.cell_id === activeCellId ? 3 : 1.4,
        fillColor: styleColorForHealth(habitat.health_label),
        fillOpacity: emphasis ? 0.5 : 0.14,
      },
    );

    polygon.on("click", () => {
      activeCellId = habitat.cell_id;
      activeSensorId = null;
      drawMapLayers();
      buildHabitatList();
    });
    polygon.bindTooltip(
      `${titleCase(habitat.habitat_type)} • ${Math.round(habitat.biodiversity_score)} • ${leadPressure?.common_name || "No species"}`,
    );
    polygon.addTo(habitatLayerGroup);
  });

  sensorState.forEach((sensor) => {
    const profile = sensorProfilesState.find((item) => item.sensor_id === sensor.sensor_id);
    const marker = window.L.circleMarker([sensor.location[1], sensor.location[0]], {
      radius: sensor.sensor_id === activeSensorId ? 9 : 7,
      color: "#241f1b",
      weight: 1.5,
      fillColor: "#f5efe4",
      fillOpacity: 0.92,
    });

    marker.on("click", () => {
      activeSensorId = sensor.sensor_id;
      activeCellId = null;
      drawMapLayers();
    });
    marker.bindTooltip(profile?.label || titleCase(sensor.sensor_id));
    marker.addTo(sensorLayerGroup);
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
      activeCellId = null;
      drawMapLayers();
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

async function loadDashboard() {
  const response = await fetch("/api/demo-biodiversity");
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const payload = await response.json();
  habitatState = payload.habitats;
  sensorState = payload.sensors;
  studyAreaState = payload.study_area;
  landmarkState = payload.landmarks || [];
  speciesCatalogState = payload.species_catalog || [];
  sensorProfilesState = payload.sensor_profiles || [];
  dataSourcesState = payload.data_sources || [];
  activeCellId = habitatState[0]?.cell_id || null;
  activeSpeciesName = speciesCatalogState[0]?.common_name || null;

  buildSummaryCards(payload.overview);
  buildHeroMetrics(payload.overview);
  buildNarrativeSummary(payload.overview);
  buildHabitatList();
  buildStressedSpeciesRail();
  buildSpeciesList();
  buildSensorList();
  buildSourceList();
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
}

bindViewTabs();

loadDashboard().catch((error) => {
  renderError(`Unable to load EcoScan data: ${error.message}`);
});
