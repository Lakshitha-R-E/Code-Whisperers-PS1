// ── Watersheds ────────────────────────────────────────────────────────────────
export interface WatershedProperties {
  id: string;
  name: string;
  district: string;
  state: string;
  area_sq_km: number;
}

export interface WatershedFeature {
  type: 'Feature';
  id: string;
  properties: WatershedProperties;
  geometry: GeoJsonPolygon;
}

export interface WatershedCollection {
  type: 'FeatureCollection';
  features: WatershedFeature[];
}

// ── GIS Layers ────────────────────────────────────────────────────────────────
export type GisLayerType =
  | 'lulc'
  | 'vegetation'
  | 'drainage'
  | 'water_bodies'
  | 'interventions'
  | 'slope';

export interface GisFeatureProperties {
  id: string;
  watershed_id: string;
  layer_type: GisLayerType;
  category: string;
  label: string;
}

export type GisFeature = GeoJsonFeature<GisFeatureProperties>;

export interface GisLayerCollection {
  type: 'FeatureCollection';
  features: GisFeature[];
}

// ── Projects ──────────────────────────────────────────────────────────────────
export type ProjectType =
  | 'Check Dam'
  | 'Farm Pond'
  | 'Afforestation'
  | 'Contour Trenching';

export type ProjectStatus = 'Completed' | 'Ongoing' | 'Delayed';

export interface InspectionEntry {
  date: string;
  note: string;
}

export interface PhotoRecord {
  url: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface ProjectPhotos {
  before: PhotoRecord;
  after: PhotoRecord;
}

export interface Project {
  id: string;
  name: string;
  watershed_id: string;
  district: string;
  lat: number;
  lng: number;
  type: ProjectType;
  status: ProjectStatus;
  completion_pct: number;
  start_date: string;
  structure_age_years: number;
  last_inspection_date: string;
  inspection_history: InspectionEntry[];
  photos: ProjectPhotos;
}

// ── Geo Evidence ──────────────────────────────────────────────────────────────
export type CheckResult = 'pass' | 'fail';

export interface GeoEvidence {
  project_id: string;
  gps_check: CheckResult;
  timestamp_check: CheckResult;
  metadata_check: CheckResult;
  duplicate_check: CheckResult;
  distance_from_registered_location_m: number;
  trust_score: number; // 1–5
}

// ── LULC Trend ────────────────────────────────────────────────────────────────
export interface LulcTrendEntry {
  watershed_id: string;
  years: number[];
  forest_pct: number[];
  agricultural_pct: number[];
  water_bodies_pct: number[];
  barren_degraded_pct: number[];
}

// ── Maintenance Alerts ────────────────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AlertReason =
  | 'Inspection overdue'
  | 'Missing recent evidence'
  | 'Structure aging'
  | 'Spatial risk indicator';

export interface MaintenanceAlert {
  id: string;
  project_id: string;
  reason: AlertReason;
  severity: AlertSeverity;
  days_since_last_inspection: number; // live-computed, not a static mock value
  message: string;
  // Structured explanation fields — power the "why is this flagged" detail view.
  thresholdDays?: number;   // the applicable rule (e.g. 90-day inspection interval)
  actualDays?: number;      // the real measured value being compared against it
  overdueBy?: number;       // actualDays - thresholdDays, when relevant
  detail?: string;          // longer, structured explanation of the specific breach
}

// ── What-If Simulator ─────────────────────────────────────────────────────────
export interface CandidatePoint {
  id: string;
  type: ProjectType;
  lat: number;
  lng: number;
  scores: {
    distanceToWaterBody: number;  // normalised 0–100
    distanceToDrainage: number;   // normalised 0–100
    landUseSuitability: number;   // normalised 0–100
    total: number;                // weighted average
  };
  nearestWaterBodyM: number;
  nearestDrainageM: number;
  landUseCategory: string;
}

// ── Multi-type ranked suitability (What-If Simulator v2) ─────────────────────
export type CandidateInterventionType =
  | 'Check Dam'
  | 'Farm Pond'
  | 'Percolation Tank'
  | 'Contour Bunding'
  | 'Farm Bund';

export interface RankedCandidateBreakdown {
  drainage: number; // 0-100
  water: number;    // 0-100
  landUse: number;  // 0-100
  slope: number;    // 0-100
}

export interface RankedCandidateChecks {
  nearDrainage: boolean;
  suitableSlope: boolean;
  nearWaterFlow: boolean;
  landUseSuitable: boolean;
  noConflict: boolean;
}

export interface RankedCandidateConflict {
  projectName: string;
  distanceM: number;
}

export interface RankedCandidate {
  type: CandidateInterventionType;
  total: number; // 0-100, after conflict penalty if any
  breakdown: RankedCandidateBreakdown;
  checks: RankedCandidateChecks;
  conflict?: RankedCandidateConflict;
}

export interface RankedLocation {
  id: string;
  lat: number;
  lng: number;
  results: RankedCandidate[]; // sorted descending by total
}

// ── Generic GeoJSON helpers ───────────────────────────────────────────────────
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon | GeoJsonLineString;

export interface GeoJsonFeature<P = Record<string, unknown>> {
  type: 'Feature';
  properties: P;
  geometry: GeoJsonGeometry;
}
