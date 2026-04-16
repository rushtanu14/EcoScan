const summaryCards = document.getElementById("summaryCards");
const heroMetrics = document.getElementById("heroMetrics");
const snapshotTitle = document.getElementById("snapshotTitle");
const snapshotSummary = document.getElementById("snapshotSummary");
const snapshotExplain = document.getElementById("snapshotExplain");
const habitatList = document.getElementById("habitatList");
const narrativeSummary = document.getElementById("narrativeSummary");
const stressedSpeciesRail = document.getElementById("stressedSpeciesRail");
const mapMeta = document.getElementById("mapMeta");
const detailCard = document.getElementById("detailCard");
const detailTitle = document.getElementById("detailTitle");
const speciesList = document.getElementById("speciesList");
const speciesDetail = document.getElementById("speciesDetail");
const speciesDetailTitle = document.getElementById("speciesDetailTitle");
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
let systemSnapshotState = {};
let locationContextState = {};
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

function buildSnapshot() {
  snapshotTitle.textContent = systemSnapshotState.title || "EcoScan system snapshot";
  snapshotSummary.textContent = systemSnapshotState.summary || studyAreaState.story;
  const bullets = systemSnapshotState.what_is_real || [];

  snapshotExplain.innerHTML = `
    <article class="snapshot-card">
      <span>Observed window</span>
      <strong>${systemSnapshotState.observed_window || "Not supplied"}</strong>
      <p>${locationContextState.why_here || studyAreaState.story}</p>
    </article>
    <article class="snapshot-card">
      <span>Why this landscape</span>
      <strong>${studyAreaState.name}</strong>
      <p>${locationContextState.pressure_story || studyAreaState.story}</p>
    </article>
    ${bullets
      .map(
        (bullet) => `
          <article class="snapshot-note">
            <span>What is real</span>
            <p>${bullet}</p>
          </article>
        `,
      )
      .join("")}
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
      const selected = habitatState.find((habitat) => habitat.cell_id === activeCellId);
      renderHabitatDetail(selected);
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
      renderSpeciesDetail(findSpeciesByName(activeSpeciesName));
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
      <button class="species-item ${species.status_label} ${species.common_name === activeSpeciesName ? "is-active" : ""}" data-species-name="${species.common_name}">
        <div class="species-topline">
          <span>${titleCase(species.kingdom)}</span>
          <strong>${species.common_name}</strong>
        </div>
        <p><em>${species.scientific_name}</em></p>
        <p>${species.habitat_need}</p>
        <div class="species-meta">
          <span>${species.stressed_habitat_count}/${species.total_habitats} habitats under stress</span>
          <strong>${formatPercent(species.avg_vulnerability_score)}</strong>
        </div>
      </button>
    `)
    .join("");

  speciesList.querySelectorAll(".species-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeSpeciesName = button.dataset.speciesName;
      renderSpeciesDetail(findSpeciesByName(activeSpeciesName));
      drawMapLayers();
      buildStressedSpeciesRail();
      buildSpeciesList();
    });
  });
}

function renderSpeciesDetail(species) {
  if (!species) {
    speciesDetailTitle.textContent = "Choose a species";
    speciesDetail.innerHTML = '<p class="empty-state">Select a species card to inspect its pressure story.</p>';
    return;
  }

  speciesDetailTitle.textContent = species.common_name;
  speciesDetail.innerHTML = `
    <div>
      <p class="panel-label">Species stress</p>
      <h3>${formatPercent(species.avg_vulnerability_score)}</h3>
      <p>${species.narrative}</p>
    </div>
    <div class="detail-stat">
      <span>Scientific name</span>
      <strong><em>${species.scientific_name}</em></strong>
    </div>
    <div class="detail-stat">
      <span>Habitat need</span>
      <strong>${species.habitat_need}</strong>
    </div>
    <div class="detail-stat">
      <span>Stressed habitats</span>
      <strong>${species.stressed_habitat_count} of ${species.total_habitats}</strong>
    </div>
    <div>
      <p class="panel-label">Lead pressure factors</p>
      <div class="tag-row">
        ${species.pressure_factors.map((factor) => `<span class="tag">${titleCase(factor)}</span>`).join("")}
      </div>
    </div>
    <div class="source-link">
      <a href="${species.source_url}" target="_blank" rel="noreferrer">Open species reference</a>
    </div>
  `;
}

function buildMapMeta() {
  mapMeta.innerHTML = `
    <article class="metric-pill map-pill">
      <span>Location</span>
      <strong>${studyAreaState.name}</strong>
      <p>${studyAreaState.story}</p>
    </article>
    <article class="metric-pill map-pill">
      <span>Map mode</span>
      <strong>${activeSpeciesName || "All habitat stress"}</strong>
      <p>Leaflet map centered on the real Coyote Valley study area.</p>
    </article>
  `;
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
  buildMapMeta();
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
      renderHabitatDetail(habitat);
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
      renderSensorDetail(sensor, profile);
      drawMapLayers();
    });
    marker.bindTooltip(profile?.label || titleCase(sensor.sensor_id));
    marker.addTo(sensorLayerGroup);
  });
}

function renderHabitatDetail(habitat) {
  if (!habitat) {
    detailTitle.textContent = "Select a habitat, station, or species";
    detailCard.innerHTML = '<p class="empty-state">Choose a habitat polygon to inspect biodiversity stress.</p>';
    return;
  }

  detailTitle.textContent = `${titleCase(habitat.habitat_type)} • ${habitat.cell_id}`;
  detailCard.innerHTML = `
    <div>
      <p class="panel-label">Habitat diagnosis</p>
      <h3>${habitat.biodiversity_score}</h3>
      <p>${habitat.habitat_story}</p>
    </div>
    <div class="detail-stat">
      <span>Status</span>
      <strong>${titleCase(habitat.health_label)}</strong>
    </div>
    <div class="detail-stat">
      <span>Most stressed species</span>
      <strong>${habitat.species_pressures[0].common_name}</strong>
    </div>
    <div>
      <p class="panel-label">Pressure signals</p>
      <div class="tag-row">
        ${habitat.key_signals.map((signal) => `<span class="tag">${titleCase(signal)}</span>`).join("")}
      </div>
    </div>
    <div>
      <p class="panel-label">Recommended actions</p>
      <div class="action-list">
        ${habitat.recommended_actions.map((action) => `<span class="action-chip">${action}</span>`).join("")}
      </div>
    </div>
    <div>
      <p class="panel-label">Species under pressure</p>
      ${habitat.species_pressures
        .slice(0, 4)
        .map(
          (pressure) => `
            <div class="detail-stat">
              <span>${pressure.common_name}</span>
              <strong>${formatPercent(pressure.vulnerability_score)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSensorDetail(sensor, profile) {
  detailTitle.textContent = profile?.label || titleCase(sensor.sensor_id);
  detailCard.innerHTML = `
    <div>
      <p class="panel-label">Station context</p>
      <h3>${profile?.label || titleCase(sensor.sensor_id)}</h3>
      <p>${profile?.summary || "This station provides field context for nearby habitat cells."}</p>
    </div>
    <div class="detail-stat">
      <span>Why it matters</span>
      <strong>${profile?.kind || "Field sensor"}</strong>
    </div>
    <div class="detail-stat">
      <span>PM2.5</span>
      <strong>${sensor.readings.pm25}</strong>
    </div>
    <div class="detail-stat">
      <span>Humidity</span>
      <strong>${sensor.readings.humidity}</strong>
    </div>
    <div class="detail-stat">
      <span>Soil moisture</span>
      <strong>${sensor.readings.soil_moisture}</strong>
    </div>
    <div class="detail-stat">
      <span>Water pH</span>
      <strong>${sensor.readings.water_ph}</strong>
    </div>
    ${
      profile?.source_url
        ? `<div class="source-link"><a href="${profile.source_url}" target="_blank" rel="noreferrer">Open station reference</a></div>`
        : ""
    }
  `;
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
      const sensor = sensorState.find((item) => item.sensor_id === activeSensorId);
      const profile = sensorProfilesState.find((item) => item.sensor_id === activeSensorId);
      renderSensorDetail(sensor, profile);
      activateView("mapView");
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
  systemSnapshotState = payload.system_snapshot || {};
  locationContextState = payload.location_context || {};
  activeCellId = habitatState[0]?.cell_id || null;
  activeSpeciesName = speciesCatalogState[0]?.common_name || null;

  buildSummaryCards(payload.overview);
  buildHeroMetrics(payload.overview);
  buildSnapshot();
  buildNarrativeSummary(payload.overview);
  buildHabitatList();
  buildStressedSpeciesRail();
  buildSpeciesList();
  buildSensorList();
  buildSourceList();
  renderHabitatDetail(habitatState[0]);
  renderSpeciesDetail(findSpeciesByName(activeSpeciesName));
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
  snapshotExplain.innerHTML = markup;
  detailCard.innerHTML = markup;
  speciesDetail.innerHTML = markup;
}

bindViewTabs();

loadDashboard().catch((error) => {
  renderError(`Unable to load EcoScan data: ${error.message}`);
});
