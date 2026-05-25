const API_BASE = "/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Non authentifié");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Erreur ${res.status}`);
  }

  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams({ username: email, password });
  return fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Identifiants incorrects" }));
      throw new Error(err.detail);
    }
    return res.json();
  });
}

export function getMe(): Promise<UserProfile> {
  return request("/auth/me");
}

// ─── Admin (superadmin uniquement) ──────────────────────────

export interface AdminUserCreate {
  email: string;
  full_name: string;
  password: string;
  role: string;
  /** Si true, le backend envoie au nouvel utilisateur ses identifiants par email (si SMTP configuré). */
  send_email?: boolean;
}

export interface AdminUserUpdate {
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export function listUsers(): Promise<UserProfile[]> {
  return request("/auth/users");
}

export function createUser(payload: AdminUserCreate): Promise<UserProfile> {
  return request("/auth/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(
  userId: number,
  payload: AdminUserUpdate
): Promise<UserProfile> {
  return request(`/auth/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteUser(userId: number): Promise<void> {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}/auth/users/${userId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `Erreur ${res.status}`);
    }
  });
}

// ─── Carto ───────────────────────────────────────────────────

export interface ForestZone {
  id: number;
  name: string;
  code: string;
  description: string | null;
  area_ha: number | null;
  geometry: GeoJSON.Geometry | null;
  created_at: string;
}

export function getZones(): Promise<ForestZone[]> {
  return request("/carto/zones");
}

export function getZone(id: number): Promise<ForestZone> {
  return request(`/carto/zones/${id}`);
}

export interface GEEClipRequest {
  forest_zone_id: number;
  layer_type: string;
  date_start?: string;
  date_end?: string;
}

export interface GEEClipResponse {
  forest_zone_id: number;
  forest_zone_name: string;
  layer_type: string;
  tile_url: string;
  stats: Record<string, unknown>;
}

export function clipGEE(payload: GEEClipRequest): Promise<GEEClipResponse> {
  return request("/carto/gee/clip", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getForetsGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  return request("/carto/geojson/forets");
}

// ─── KPI ─────────────────────────────────────────────────────

export interface KoboForm {
  key?: string | null;
  uid: string;
  name: string;
  deployment_status: string;
  submission_count: number;
}

export interface KoboFormConfigured {
  key: string;
  uid: string;
  name: string;
  deployment_status: string;
  submission_count: number;
}

export interface KoboDashboard {
  total_forms: number;
  total_submissions: number;
  forms: { key?: string | null; uid: string; name: string; submissions: number }[];
}

export interface KpiIndicator {
  indicator_name: string;
  value: number | string;
  unit: string | null;
  period: string | null;
}

export interface FormKpiDashboard {
  form_uid: string;
  form_name: string;
  total_submissions: number;
  indicators: KpiIndicator[];
}

export function getKoboForms(): Promise<KoboForm[]> {
  return request("/kpi/forms");
}

export function getConfiguredKoboForms(): Promise<KoboFormConfigured[]> {
  return request("/kpi/forms/configured");
}

export function getKoboDashboard(): Promise<KoboDashboard> {
  return request("/kpi/dashboard");
}

export function getKoboSubmissions(formUid: string, limit = 100): Promise<unknown[]> {
  return request(`/kpi/forms/${formUid}/submissions?limit=${limit}`);
}

export function getFormKpiDashboard(formKey: string): Promise<FormKpiDashboard> {
  return request(`/kpi/forms/${formKey}/dashboard`);
}

export type TimelineEntry = Record<string, string | number>;

export function getTimeline(): Promise<TimelineEntry[]> {
  return request("/kpi/timeline");
}

export interface FormIndicators {
  form_key: string;
  form_name: string;
  total_submissions: number;
  indicators: KpiIndicator[];
}

export interface GlobalIndicators {
  total_submissions: number;
  forms: FormIndicators[];
}

export function getGlobalIndicators(forest?: string): Promise<GlobalIndicators> {
  const qs = forest ? `?forest=${encodeURIComponent(forest)}` : "";
  return request(`/kpi/indicators${qs}`);
}

export interface FormForests {
  form_key: string;
  form_name: string;
  forests: string[];
}

export interface ForestsResponse {
  forms: FormForests[];
  all_forests: string[];
}

export function getForests(): Promise<ForestsResponse> {
  return request("/kpi/forests");
}

export interface FormIndicatorsByForest {
  form_key: string;
  form_name: string;
  total_submissions: number;
  by_forest: Record<string, KpiIndicator[]>;
  submissions_by_forest: Record<string, number>;
}

export interface IndicatorsByForestResponse {
  forms: FormIndicatorsByForest[];
}

export function getIndicatorsByForest(): Promise<IndicatorsByForestResponse> {
  return request("/kpi/indicators/by-forest");
}

export interface CountedItem {
  name: string;
  value: number;
}

export interface HealthByForest {
  forest: string;
  vivants: number;
  morts: number;
  degrades: number;
}

export interface HealthBySpecies {
  espece: string;
  vivants: number;
  morts: number;
  degrades: number;
}

export interface HealthByParcel {
  parcelle: string;
  vivants: number;
  morts: number;
  degrades: number;
}

export interface FactorByForest {
  forest: string;
  factor: string;
  value: number;
}

export interface FactorDominant {
  name: string;
  value: number;
  pct: number;
}

export interface ReboisementQualityMetrics {
  taux_photo_arbre_pct: number;
  taux_commentaire_arbre_pct: number;
  taux_photo_equipe_pct: number;
  taux_signature_pct: number;
  arbres_total: number;
  missions_total: number;
}

export interface ReboisementJaccardPair {
  forest_a: string;
  forest_b: string;
  species_a: number;
  species_b: number;
  common: number;
  jaccard: number;
}

export interface ReboisementBreakdowns {
  top_species: CountedItem[];
  top_local_names: CountedItem[];
  factors: CountedItem[];
  by_parcelle: CountedItem[];
  by_responsable: CountedItem[];
  health_by_forest: HealthByForest[];
  health_by_species: HealthBySpecies[];
  health_by_parcel: HealthByParcel[];
  richesse_by_forest: CountedItem[];
  factors_by_forest: FactorByForest[];
  factor_dominant: FactorDominant | null;
  jaccard_pairs: ReboisementJaccardPair[];
  quality_metrics: ReboisementQualityMetrics | null;
}

export function getReboisementBreakdowns(): Promise<ReboisementBreakdowns> {
  return request("/kpi/reboisement/breakdowns");
}

// ─── Planting (suivi des plantations) ─────────────────────────

export interface PlantingEspeceItem {
  name: string;
  code: string;
  plants: number;
  parcelles: number;
}

export interface PlantingParcelleItem {
  parcelle: string;
  plants: number;
  forest: string;
  surface_ha: number;
}

export interface PlantingForestSurface {
  forest: string;
  surface_ha: number;
}

export interface PlantingEspeceByForest {
  forest: string;
  espece: string;
  value: number;
}

export interface PlantingTimelinePoint {
  date: string;
  missions: number;
}

export interface PlantingCoherenceRow {
  parcelle: string;
  declares: number;
  comptes: number;
  ecart: number;
}

export interface PlantingParcelDetail {
  parcelle: string;
  forest: string;
  surface_ha: number;
  nb_especes: number;
  plants_declares: number;
  plants_comptes: number;
  type_reboisement: string;
  origine_plants: string;
  responsable: string;
  date: string;
}

export interface PlantingQualityMetrics {
  taux_photo_parcelle_pct: number;
  taux_delimitation_pct: number;
  taux_gps_centre_pct: number;
  taux_photo_equipe_pct: number;
  taux_signature_pct: number;
  taux_commentaire_pct: number;
  taux_coherence_pct: number;
  plants_total: number;
  plants_declares_total: number;
  missions_total: number;
}

export interface PlantingBreakdowns {
  top_especes: PlantingEspeceItem[];
  plants_par_parcelle: PlantingParcelleItem[];
  plants_par_forest: CountedItem[];
  surface_par_forest: PlantingForestSurface[];
  type_reboisement: CountedItem[];
  origine_plants: CountedItem[];
  organisme_don: CountedItem[];
  plants_par_responsable: CountedItem[];
  especes_par_forest: PlantingEspeceByForest[];
  timeline: PlantingTimelinePoint[];
  coherence_top: PlantingCoherenceRow[];
  parcelles_detail: PlantingParcelDetail[];
  quality_metrics: PlantingQualityMetrics | null;
}

export function getPlantingBreakdowns(): Promise<PlantingBreakdowns> {
  return request("/kpi/planting/breakdowns");
}

export interface ForestValue {
  forest: string;
  value: number;
}

export interface DominantIndexByGroup {
  group: string;
  indice: string;
  value: number;
}

export interface CompositionItem {
  forest: string;
  group: string;
  value: number;
  pct: number;
}

export interface RatioObsWater {
  forest: string;
  observations: number;
  points_eau: number;
  ratio: number | null;
}

export interface DistanceToWater {
  forest: string;
  mean_distance_m: number;
  min_distance_m: number;
  max_distance_m: number;
  sample_size: number;
}

export interface JaccardPair {
  forest_a: string;
  forest_b: string;
  species_a: number;
  species_b: number;
  common: number;
  jaccard: number;
}

export interface ForestDureeItem {
  forest: string;
  value: number;
}

export interface FauneBreakdowns {
  top_species: CountedItem[];
  top_scientific_names: CountedItem[];
  abundance_by_species: CountedItem[];
  groups: CountedItem[];
  indices: CountedItem[];
  indice_dominant_par_groupe: DominantIndexByGroup[];
  certitude_distribution: CountedItem[];
  type_observation_distribution: CountedItem[];
  missions_by_forest: ForestValue[];
  observations_by_forest: ForestValue[];
  richesse_by_forest: CountedItem[];
  richesse_by_group: CountedItem[];
  composition_by_forest_group: CompositionItem[];
  points_eau_by_forest: ForestValue[];
  ratio_observations_points_eau: RatioObsWater[];
  mean_distance_to_water: DistanceToWater[];
  jaccard_pairs: JaccardPair[];
  duree_totale_heures: number;
  duree_par_foret: ForestDureeItem[];
  indice_abondance_horaire: number;
}

export function getFauneBreakdowns(): Promise<FauneBreakdowns> {
  return request("/kpi/faune/breakdowns");
}

// ── Menaces forestières ──────────────────────────────────────

export interface MenacesSummary {
  missions_total: number;
  observations_menaces_total: number;
  nombre_total_indices: number;
  score_moyen_gravite: number;
  taux_menaces_graves_pct: number;
  taux_menaces_recentes_pct: number;
  indice_pression_brut: number;
  indice_pression_active: number;
  taux_observations_photo_pct: number;
  taux_menaces_geolocalisees_pct: number;
  duree_totale_heures: number;
  observations_par_mission: number;
  observations_par_heure: number;
}

export interface MenacesForestValue {
  forest: string;
  value: number;
}

export interface MenacesTypeForestItem {
  forest: string;
  type_pression: string;
  value: number;
}

export interface MenacesGraviteItem {
  niveau_gravite: string;
  label: string;
  value: number;
}

export interface MenacesGraviteByForestItem {
  forest: string;
  niveau_gravite: string;
  value: number;
}

export interface MenacesGraviteByTypeItem {
  type_pression: string;
  niveau_gravite: string;
  value: number;
}

export interface MenacesScoreByForest {
  forest: string;
  value: number;
}

export interface MenacesScoreByType {
  type_pression: string;
  value: number;
}

export interface MenacesAncienneteItem {
  anciennete_indice: string;
  label: string;
  value: number;
}

export interface MenacesAncienneteByForestItem {
  forest: string;
  anciennete_indice: string;
  value: number;
}

export interface MenacesAncienneteByTypeItem {
  type_pression: string;
  anciennete_indice: string;
  value: number;
}

export interface MenacesIndicesByType {
  name: string;
  value: number;
}

export interface MenacesIndiceDominantByType {
  type_pression: string;
  indice: string | null;
  value: number;
}

export interface MenacesIndiceDetailByType {
  type_pression: string;
  indice: string;
  value: number;
  share_pct: number;
}

export interface MenacesIndiceParForestItem {
  forest: string;
  indice: string;
  value: number;
}

export interface MenacesPressureByType {
  type_pression: string;
  value: number;
}

export interface MenacesPrioriteItem {
  type_pression: string;
  score: number;
  nombre_observations: number;
  nombre_indices: number;
  score_moyen_gravite: number;
  score_moyen_anciennete: number;
}

export interface MenacesRadarItem {
  forest: string;
  type_pression: string;
  value: number;
  normalized: number;
}

export interface MenacesJaccardPair {
  forest_a: string;
  forest_b: string;
  types_a: number;
  types_b: number;
  common: number;
  jaccard: number;
}

export interface MenacesQualityMetrics {
  taux_observations_photo_pct: number;
  taux_observations_commentaire_pct: number;
  taux_missions_signature_pct: number;
  taux_missions_photo_equipe_pct: number;
  taux_geolocalisees_pct: number;
  observations_total: number;
  missions_total: number;
}

export interface MenacesBreakdowns {
  summary: MenacesSummary;
  types_pression: CountedItem[];
  indices_pression: CountedItem[];
  indices_dominants_par_type: MenacesIndiceDominantByType[];
  indices_detail_par_type: MenacesIndiceDetailByType[];
  indices_par_type: MenacesIndicesByType[];
  indices_par_forest: MenacesForestValue[];
  indices_pression_par_forest: MenacesIndiceParForestItem[];
  observations_par_forest: MenacesForestValue[];
  missions_par_forest: MenacesForestValue[];
  types_par_forest: MenacesTypeForestItem[];
  gravite_distribution: MenacesGraviteItem[];
  gravite_par_forest: MenacesGraviteByForestItem[];
  gravite_par_type: MenacesGraviteByTypeItem[];
  score_gravite_par_forest: MenacesScoreByForest[];
  score_gravite_par_type: MenacesScoreByType[];
  anciennete_distribution: MenacesAncienneteItem[];
  anciennete_par_forest: MenacesAncienneteByForestItem[];
  anciennete_par_type: MenacesAncienneteByTypeItem[];
  pression_par_forest: MenacesForestValue[];
  pression_par_type: MenacesPressureByType[];
  priorite_par_type: MenacesPrioriteItem[];
  radar_profile: MenacesRadarItem[];
  jaccard_pairs: MenacesJaccardPair[];
  quality_metrics: MenacesQualityMetrics;
  autres_libelles: CountedItem[];
}

export function getMenacesBreakdowns(): Promise<MenacesBreakdowns> {
  return request("/kpi/menaces/breakdowns");
}

export interface EcogardeStats {
  username: string;
  total_submissions: number;
  total_missions: number;
  forms_covered: number;
  by_form: Record<string, number>;
}

export interface EcogardesResponse {
  total_ecogardes: number;
  total_submissions: number;
  total_missions: number;
  ecogardes: EcogardeStats[];
}

export function getEcogardesStats(): Promise<EcogardesResponse> {
  return request("/kpi/ecogardes");
}

export interface EcogardeInTeam {
  username: string;
  total_submissions: number;
  total_missions: number;
  forms_covered: number;
}

export interface TeamStats {
  team_name: string;
  chefs_mission: string[];
  membres: EcogardeInTeam[];
  total_submissions: number;
  total_missions: number;
  forms_covered: number;
}

export interface TeamsResponse {
  total_teams: number;
  total_members: number;
  total_submissions: number;
  teams: TeamStats[];
}

export function getTeamsStats(): Promise<TeamsResponse> {
  return request("/kpi/teams");
}

export interface TeamMissionEntry {
  date_mission: string | null;
  activite: string;
  activite_label: string;
  foret: string;
  membres: string[];
  chef_equipe: string | null;
}

export interface TeamMissionsResponse {
  total: number;
  missions: TeamMissionEntry[];
}

export function getTeamMissions(): Promise<TeamMissionsResponse> {
  return request("/kpi/team-missions");
}

export interface PublicSummary {
  trees_planted: number;
}

/** Endpoint public (sans auth) pour la page d'accueil. */
export function getPublicSummary(): Promise<PublicSummary> {
  return fetch(`${API_BASE}/kpi/public/summary`).then((res) => {
    if (!res.ok) throw new Error("public summary unavailable");
    return res.json();
  });
}

// ─── Médias (vidéos page d'accueil) ─────────────────────────────────────────

export interface MediaVideo {
  key: string;
  filename: string;
  url: string;
  available: boolean;
  size_bytes: number;
  updated_at: string | null;
}

/** Liste les vidéos disponibles (public). */
export function listVideos(): Promise<MediaVideo[]> {
  return fetch(`${API_BASE}/media/videos`).then((res) => {
    if (!res.ok) throw new Error("Impossible de lister les vidéos");
    return res.json();
  });
}

/** Téléverse une nouvelle vidéo (superadmin uniquement). */
export async function uploadVideo(videoKey: string, file: File): Promise<MediaVideo> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/media/videos/${videoKey}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Erreur ${res.status}`);
  }
  return res.json();
}

/** Supprime une vidéo existante (superadmin uniquement). */
export function deleteVideo(videoKey: string): Promise<MediaVideo> {
  return request<MediaVideo>(`/media/videos/${videoKey}`, { method: "DELETE" });
}

// ─── Export Excel des soumissions Kobo ─────────────────────────────────────

/**
 * Télécharge le fichier .xlsx d'un formulaire et déclenche son enregistrement
 * dans le navigateur. Retourne le nom de fichier réellement utilisé.
 */
export async function downloadFormXlsx(
  formUid: string,
  options: { showAll?: boolean; filename?: string } = {},
): Promise<string> {
  const token = localStorage.getItem("token");
  const qs = options.showAll ? "?show_all=true" : "";
  const res = await fetch(
    `${API_BASE}/kpi/forms/${encodeURIComponent(formUid)}/export.xlsx${qs}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Erreur ${res.status}`);
  }

  // Récupère le nom proposé par le serveur, sinon repli sur l'option fournie
  let filename = options.filename || `${formUid}.xlsx`;
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  if (match && match[1]) {
    filename = decodeURIComponent(match[1].replace(/"$/, ""));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export interface SubmissionLocation {
  form_key: string;
  form_name: string;
  submission_id: number | string | null;
  submitted_at: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  label: string | null;
  image_url: string | null;
}

export interface LocationsResponse {
  total: number;
  locations: SubmissionLocation[];
}

export function getLocations(formKey?: string): Promise<LocationsResponse> {
  const qs = formKey ? `?form_key=${encodeURIComponent(formKey)}` : "";
  return request(`/kpi/locations${qs}`);
}
