export type EcoOverview = {
  avg_biodiversity_score: number;
  fragile_cells: number;
  stressed_cells: number;
  thriving_cells: number;
  top_species_at_risk: string[];
  priority_actions: string[];
};

export type SpeciesPressure = {
  common_name: string;
  scientific_name: string;
  kingdom: string;
  habitat_need: string;
  source_url: string;
  image_asset: string;
  example_images: string[];
  vulnerability_score: number;
  pressure_factors: string[];
  narrative: string;
};

export type HabitatZone = {
  cell_id: string;
  centroid: [number, number];
  polygon: [number, number][];
  habitat_type: string;
  health_label: "thriving" | "stressed" | "fragile";
  biodiversity_score: number;
  risk_score: number;
  key_signals: string[];
  habitat_story: string;
  species_pressures: SpeciesPressure[];
  recommended_actions: string[];
};

export type SpeciesSummary = {
  common_name: string;
  scientific_name: string;
  kingdom: string;
  habitat_need: string;
  source_url: string;
  image_asset: string;
  example_images: string[];
  narrative: string;
  max_vulnerability_score: number;
  avg_vulnerability_score: number;
  pressure_factors: string[];
  stressed_habitat_count: number;
  total_habitats: number;
  status_label: "thriving" | "stressed" | "fragile";
  action_items: string[];
  aliases: string[];
};

export type ScanDetection = {
  species_name: string;
  confidence: number;
  risk_level: "thriving" | "stressed" | "fragile";
  note: string;
  action_items: string[];
};

export type ScanCell = {
  cell_id: string;
  risk_score: number;
  health_label: "thriving" | "stressed" | "fragile";
  habitat_type: string;
  projected_polygon: [number, number][];
  canopy_height: number;
  lead_species: string;
  detections: ScanDetection[];
};

export type SensorProfile = {
  sensor_id: string;
  label?: string;
  kind?: string;
  coordinates?: [number, number];
  source_url?: string;
  source_name?: string;
  observed_at?: string;
  summary?: string;
  why_it_matters?: string;
  location?: [number, number];
  readings?: Record<string, number>;
};

export type DataSource = {
  name: string;
  kind: string;
  url: string;
  note: string;
};

export type StudyArea = {
  name: string;
  region: string;
  center: { lat: number; lon: number };
  bounds: { west: number; east: number; south: number; north: number };
  story: string;
};

export type Landmark = {
  name: string;
  kind: string;
  coordinates: [number, number][];
};

export type EcoPayload = {
  rows?: number;
  cols?: number;
  overview: EcoOverview;
  habitats: HabitatZone[];
  species_catalog: SpeciesSummary[];
  scan_model: ScanCell[];
  study_area: StudyArea;
  landmarks: Landmark[];
  sensors?: SensorProfile[];
  sensor_profiles?: SensorProfile[];
  data_sources?: DataSource[];
  system_snapshot?: {
    title?: string;
    summary?: string;
    observed_window?: string;
    data_mode?: string;
    what_is_real?: string[];
  };
  searchable_places?: {
    label: string;
    kind: string;
    lat: number;
    lon: number;
    zoom?: number;
    description?: string;
  }[];
  location_context?: {
    why_here?: string;
    pressure_story?: string;
  };
};
