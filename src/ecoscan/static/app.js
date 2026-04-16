const summaryCards = document.getElementById("summaryCards");
const heroMetrics = document.getElementById("heroMetrics");
const habitatMap = document.getElementById("habitatMap");
const mapMeta = document.getElementById("mapMeta");
const detailCard = document.getElementById("detailCard");
const detailTitle = document.getElementById("detailTitle");
const speciesList = document.getElementById("speciesList");
const sensorList = document.getElementById("sensorList");
const habitatList = document.getElementById("habitatList");
const narrativeSummary = document.getElementById("narrativeSummary");

let habitatState = [];
let sensorState = [];
let studyAreaState = null;
let landmarkState = [];
let activeCellId = null;
let activeSensorId = null;

const mapWidth = 1000;
const mapHeight = 680;

const titleCase = (value) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function project([lon, lat]) {
  const bounds = studyAreaState.bounds;
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * mapWidth;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * mapHeight;
  return [x, y];
}

function buildSummaryCards(overview) {
  const cards = [
    { label: "Average biodiversity score", value: `${overview.avg_biodiversity_score}`, className: "" },
    { label: "Fragile habitats", value: `${overview.fragile_cells}`, className: "danger" },
    { label: "Stressed habitats", value: `${overview.stressed_cells}`, className: "warning" },
    { label: "Thriving habitats", value: `${overview.thriving_cells}`, className: "" },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card ${card.className}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join("");

  heroMetrics.innerHTML = `
    <div class="metric-pill">
      <span>Top species at risk</span>
      <strong>${overview.top_species_at_risk[0] || "N/A"}</strong>
      <p>${studyAreaState.region}</p>
    </div>
    <div class="metric-pill">
      <span>Lead intervention</span>
      <strong>${overview.priority_actions[0] ? "1" : "0"} priority</strong>
      <p>${overview.priority_actions[0] || "No action available."}</p>
    </div>
    <div class="metric-pill">
      <span>Mission signal</span>
      <strong>${overview.fragile_cells + overview.stressed_cells}</strong>
      <p>Habitats need immediate protection or restoration action.</p>
    </div>
  `;
}

function buildMapMeta() {
  mapMeta.innerHTML = `
    <article class="metric-pill map-pill">
      <span>Study area</span>
      <strong>${studyAreaState.name}</strong>
      <p>${studyAreaState.story}</p>
    </article>
  `;
}

function buildNarrativeSummary(overview) {
  const leadHabitat = habitatState[0];
  narrativeSummary.innerHTML = `
    <article class="summary-story">
      <strong>${overview.top_species_at_risk[0] || "No lead species"}</strong>
      <p>The strongest current warning is coming from ${leadHabitat.habitat_type} habitat near ${studyAreaState.region}.</p>
      <p>${leadHabitat.habitat_story}</p>
      <p><strong>Priority action:</strong> ${overview.priority_actions[0] || "No action available."}</p>
    </article>
  `;
}

function buildHabitatList() {
  habitatList.innerHTML = habitatState
    .slice(0, 5)
    .map(
      (habitat, index) => `
        <button class="habitat-row ${habitat.health_label}" data-cell-id="${habitat.cell_id}">
          <span class="row-rank">#${index + 1}</span>
          <span class="row-main">
            <strong>${titleCase(habitat.habitat_type)}</strong>
            <small>${habitat.species_pressures[0].common_name}</small>
          </span>
          <span class="row-score">${Math.round(habitat.biodiversity_score)}</span>
        </button>
      `,
    )
    .join("");

  habitatList.querySelectorAll(".habitat-row").forEach((button) => {
    button.addEventListener("click", () => {
      activeCellId = button.dataset.cellId;
      activeSensorId = null;
      const selected = habitatState.find((item) => item.cell_id === activeCellId);
      renderDetail(selected);
      buildHabitatMap();
    });
  });
}

function buildHabitatMap() {
  const landmarkMarkup = landmarkState
    .map((landmark) => {
      if (landmark.kind === "waterway") {
        const points = landmark.coordinates.map(project).map(([x, y]) => `${x},${y}`).join(" ");
        return `<polyline class="landmark waterway" points="${points}" />`;
      }

      const points = landmark.coordinates.map(project).map(([x, y]) => `${x},${y}`).join(" ");
      return `<polygon class="landmark ${landmark.kind}" points="${points}" />`;
    })
    .join("");

  const habitatMarkup = habitatState
    .map((habitat) => {
      const points = habitat.polygon.map(project).map(([x, y]) => `${x},${y}`).join(" ");
      const [labelX, labelY] = project(habitat.centroid);
      return `
        <g class="map-feature">
          <polygon
            class="map-polygon ${habitat.health_label} ${habitat.cell_id === activeCellId ? "is-active" : ""}"
            data-cell-id="${habitat.cell_id}"
            points="${points}"
          ></polygon>
          <text class="map-label" x="${labelX}" y="${labelY}">${Math.round(habitat.biodiversity_score)}</text>
        </g>
      `;
    })
    .join("");

  const sensorMarkup = sensorState
    .map((sensor) => {
      const [x, y] = project(sensor.location);
      return `
        <g class="sensor-marker ${sensor.sensor_id === activeSensorId ? "is-active" : ""}" data-sensor-id="${sensor.sensor_id}">
          <circle class="sensor-core" cx="${x}" cy="${y}" r="8"></circle>
          <circle class="sensor-pulse" cx="${x}" cy="${y}" r="16"></circle>
        </g>
      `;
    })
    .join("");

  habitatMap.innerHTML = `
    <defs>
      <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f7f1df"></stop>
        <stop offset="100%" stop-color="#e8ddc0"></stop>
      </linearGradient>
    </defs>
    <rect width="${mapWidth}" height="${mapHeight}" rx="30" fill="url(#mapBg)"></rect>
    <rect class="map-boundary" x="14" y="14" width="${mapWidth - 28}" height="${mapHeight - 28}" rx="26"></rect>
    ${landmarkMarkup}
    ${habitatMarkup}
    ${sensorMarkup}
  `;

  habitatMap.querySelectorAll(".map-polygon").forEach((polygon) => {
    polygon.addEventListener("click", () => {
      activeCellId = polygon.dataset.cellId;
      activeSensorId = null;
      const selected = habitatState.find((item) => item.cell_id === activeCellId);
      renderDetail(selected);
      buildHabitatMap();
    });
  });

  habitatMap.querySelectorAll(".sensor-marker").forEach((marker) => {
    marker.addEventListener("click", () => {
      activeSensorId = marker.dataset.sensorId;
      activeCellId = null;
      const selected = sensorState.find((item) => item.sensor_id === activeSensorId);
      renderSensorDetail(selected);
      buildHabitatMap();
    });
  });
}

function renderDetail(habitat) {
  if (!habitat) {
    detailTitle.textContent = "Select a habitat polygon";
    detailCard.innerHTML = '<p class="empty-state">Choose a mapped habitat to inspect biodiversity stress.</p>';
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
      <span>Most at-risk species</span>
      <strong>${habitat.species_pressures[0].common_name}</strong>
    </div>
    <div class="detail-stat">
      <span>Condition</span>
      <strong>${titleCase(habitat.health_label)}</strong>
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
      <p class="panel-label">Species pressure notes</p>
      ${habitat.species_pressures
        .map(
          (pressure) => `
            <div class="detail-stat">
              <span>${pressure.common_name}</span>
              <strong>${Math.round(pressure.vulnerability_score * 100)}%</strong>
            </div>
            <p><em>${pressure.scientific_name}</em> • ${titleCase(pressure.kingdom)}. ${pressure.narrative}</p>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSensorDetail(sensor) {
  detailTitle.textContent = `${titleCase(sensor.sensor_id.replace(/-/g, " "))} station`;
  detailCard.innerHTML = `
    <div>
      <p class="panel-label">Field station context</p>
      <h3>${titleCase(sensor.sensor_id.replace(/-/g, " "))}</h3>
      <p>This station anchors nearby habitat scoring with air quality, moisture, and water-condition observations.</p>
    </div>
    <div class="detail-stat">
      <span>Coordinates</span>
      <strong>${sensor.location[1].toFixed(4)}, ${sensor.location[0].toFixed(4)}</strong>
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
  `;
}

function buildSpeciesList() {
  const species = new Map();

  habitatState.forEach((habitat) => {
    habitat.species_pressures.forEach((pressure) => {
      const current = species.get(pressure.common_name) || {
        score: 0,
        pressure_factors: [],
        narrative: pressure.narrative,
        scientific_name: pressure.scientific_name,
        kingdom: pressure.kingdom,
      };
      current.score += pressure.vulnerability_score;
      current.pressure_factors.push(...pressure.pressure_factors);
      species.set(pressure.common_name, current);
    });
  });

  const ranked = [...species.entries()]
    .map(([name, info]) => ({
      name,
      score: Math.min(100, Math.round((info.score / habitatState.length) * 100)),
      pressure_factors: [...new Set(info.pressure_factors)].slice(0, 3),
      narrative: info.narrative,
      scientific_name: info.scientific_name,
      kingdom: info.kingdom,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  speciesList.innerHTML = ranked
    .map(
      (item) => `
        <article class="species-item ${item.score >= 65 ? "danger" : item.score >= 45 ? "warning" : ""}">
          <strong>${item.name}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${item.score}%"></div></div>
          <p><em>${item.scientific_name}</em> • ${titleCase(item.kingdom)}</p>
          <p>${item.narrative}</p>
          <p>Key drivers: ${item.pressure_factors.map(titleCase).join(", ")}</p>
        </article>
      `,
    )
    .join("");
}

function buildSensorList() {
  sensorList.innerHTML = sensorState
    .map(
      (sensor) => `
        <article class="sensor-item">
          <strong>${titleCase(sensor.sensor_id.replace(/-/g, " "))}</strong>
          <p>PM2.5 ${sensor.readings.pm25} • Humidity ${sensor.readings.humidity} • Soil ${sensor.readings.soil_moisture}</p>
          <p>Water pH ${sensor.readings.water_ph} near ${sensor.location[1].toFixed(4)}, ${sensor.location[0].toFixed(4)}</p>
        </article>
      `,
    )
    .join("");
}

async function loadDashboard() {
  const response = await fetch("/api/demo-biodiversity");
  const payload = await response.json();

  studyAreaState = payload.study_area;
  landmarkState = payload.landmarks;
  habitatState = payload.habitats;
  sensorState = payload.sensors;
  activeCellId = habitatState[0]?.cell_id || null;

  buildSummaryCards(payload.overview);
  buildMapMeta();
  buildHabitatList();
  buildNarrativeSummary(payload.overview);
  buildHabitatMap();
  buildSpeciesList();
  buildSensorList();
  renderDetail(habitatState[0]);
}

loadDashboard().catch(() => {
  detailCard.innerHTML = "<p class='empty-state'>Dashboard data could not be loaded.</p>";
});
