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
