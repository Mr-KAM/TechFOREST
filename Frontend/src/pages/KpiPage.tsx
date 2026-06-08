import { useEffect, useMemo, useState } from "react";
import {
  getConfiguredKoboForms,
  getFormKpiDashboard,
  getGlobalIndicators,
  getTeamsStats,
  getTeamMissions,
  getIndicatorsByForest,
  getTimeline,
  getLocations,
  getForetsGeoJSON,
  getReboisementBreakdowns,
  getPlantingBreakdowns,
  getFauneBreakdowns,
  getMenacesBreakdowns,
  listEcogardes,
  updateEcogarde,
  deleteEcogarde,
  uploadEcogardePhoto,
  withAuthQuery,
  type SubmissionLocation,
  type TimelineEntry,
  type KoboFormConfigured,
  type FormKpiDashboard,
  type GlobalIndicators,
  type EcogardeProfile,
  type EcogardesListResponse,
  type EcogardeEnrich,
  type TeamsResponse,
  type TeamStats,
  type TeamMissionsResponse,
  type TeamMissionEntry,
  type IndicatorsByForestResponse,
  type FormIndicatorsByForest,
  type KpiIndicator,
  type ReboisementBreakdowns,
  type PlantingBreakdowns,
  type FauneBreakdowns,
  type MenacesBreakdowns,
} from "@/lib/api";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Scatter,
  ScatterChart,
  ZAxis,
  RadialBarChart,
  RadialBar,
  LabelList,
} from "recharts";
import {
  FileText,
  Database,
  ClipboardList,
  Loader2,
  TrendingUp,
  ArrowUpRight,
  Eye,
  TreePine,
  Sprout,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Bird,
  Footprints,
  Fish,
  Leaf,
  MapPin,
  ShieldAlert,
  Trees,
  RefreshCw,
  Users,
  CalendarDays,
  ExternalLink,
  Droplets,
  Camera,
  CheckCircle2,
  HelpCircle,
  Search,
  Filter,
  ArrowUpDown,
  X,
  Hash,
  MapPinned,
  Timer,
  CalendarCheck,
  UserCheck,
  TreeDeciduous,
  Pencil,
  Trash2,
  Phone,
  Mail,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, ROLES, isAdmin } from "@/lib/auth";
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, ScaleControl, GeoJSON, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";

const COLORS = ["#22d3ee", "#16a34a", "#84cc16", "#f59e0b"];

type FormMeta = {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
};

const FORM_META: Record<string, FormMeta> = {
  monitoring_faune: {
    label: "Monitoring Faune",
    description: "Suivi de la faune dans les forêts de Zaranou et Apouéba",
    icon: Eye,
    color: "#22d3ee",
  },
  monitoring_reboisement: {
    label: "Monitoring Reboisement",
    description: "Suivi des arbres dans les parcelles reboisées",
    icon: TreePine,
    color: "#16a34a",
  },
  planting_arbre: {
    label: "Plantation d'arbres",
    description: "Planting d'arbres pour la gestion des forêts",
    icon: Sprout,
    color: "#84cc16",
  },
  menaces: {
    label: "Menaces Forestières",
    description: "Signalement des menaces pour la gestion des forêts",
    icon: AlertTriangle,
    color: "#f59e0b",
  },
};

// Mapping indicateur → icône + couleur pour la Vue globale
type IndicatorDisplay = { icon: React.ElementType; color: string };
const INDICATOR_META: Record<string, IndicatorDisplay> = {
  "Suivis fauniques":         { icon: ClipboardList, color: "#22d3ee" },
  "Missions Zaranou":         { icon: TreeDeciduous, color: "#0d9488" },
  "Missions Apouéba":         { icon: TreeDeciduous, color: "#0f766e" },
  "Jours d'enquête":          { icon: CalendarCheck, color: "#0284c7" },
  "Écogardes mobilisés":      { icon: UserCheck,  color: "#0369a1" },
  "Durée moyenne d'une mission": { icon: Timer,   color: "#7c3aed" },
  "Durée totale de collecte": { icon: Timer,     color: "#6d28d9" },
  "Observations par heure":   { icon: Eye,       color: "#0ea5e9" },
  "Taux observations certaines": { icon: CheckCircle2, color: "#16a34a" },
  "Taux observations avec photo": { icon: Camera, color: "#db2777" },
  "Taux observations géolocalisées": { icon: MapPinned, color: "#0d9488" },
  "Photos d'équipe":          { icon: Camera,     color: "#db2777" },
  "Observations faune":       { icon: Eye,        color: "#0ea5e9" },
  "Mammifères observés":      { icon: Footprints, color: "#0ea5e9" },
  "Oiseaux observés":         { icon: Bird,       color: "#06b6d4" },
  "Reptiles observés":        { icon: Fish,       color: "#0891b2" },
  "Amphibiens observés":      { icon: Fish,       color: "#0e7490" },
  "Invertébrés observés":     { icon: Eye,        color: "#155e75" },
  "Rongeurs observés":        { icon: Footprints, color: "#164e63" },
  "Espèces identifiées":      { icon: Leaf,       color: "#22d3ee" },
  "Observations certaines":   { icon: CheckCircle2, color: "#16a34a" },
  "Observations probables":   { icon: HelpCircle, color: "#f59e0b" },
  "Observations directes":    { icon: Eye,        color: "#0284c7" },
  "Observations par indices": { icon: Search,     color: "#7c3aed" },
  "Observations géolocalisées": { icon: MapPinned, color: "#0d9488" },
  "Indices relevés":          { icon: Footprints, color: "#6d28d9" },
  "Individus / indices recensés": { icon: Hash,   color: "#0369a1" },
  "Photos d'observation":     { icon: Camera,     color: "#db2777" },
  "Points d'eau relevés":     { icon: Droplets,   color: "#0284c7" },
  "Points d'eau géolocalisés": { icon: MapPinned, color: "#0369a1" },
  "Photos de points d'eau":   { icon: Camera,     color: "#0891b2" },
  "Missions de reboisement":  { icon: TreePine,   color: "#16a34a" },
  "Arbres monitorés":         { icon: Trees,      color: "#15803d" },
  "Parcelles inventoriées":   { icon: MapPin,     color: "#65a30d" },
  "Responsables de mission":  { icon: UserCheck,  color: "#0369a1" },
  "Arbres vivants":           { icon: Leaf,       color: "#16a34a" },
  "Arbres morts":             { icon: AlertTriangle, color: "#b91c1c" },
  "Arbres dégradés":          { icon: ShieldAlert, color: "#ea580c" },
  "Espèces inventoriées":     { icon: Leaf,       color: "#14532d" },
  "Espèces locales":          { icon: TreeDeciduous, color: "#166534" },
  "Arbres avec dégradation":  { icon: ShieldAlert, color: "#c2410c" },
  "Facteurs de dégradation":  { icon: AlertTriangle, color: "#9a3412" },
  "Signalements de dégradation": { icon: ShieldAlert, color: "#7c2d12" },
  "Arbres géolocalisés":      { icon: MapPinned,  color: "#0d9488" },
  "Précision GPS moyenne":    { icon: Hash,       color: "#0369a1" },
  "Photos d'arbres":          { icon: Camera,     color: "#db2777" },
  "Photos d'équipe (reboisement)": { icon: Camera, color: "#be185d" },
  "Espèces reboisées":        { icon: Leaf,       color: "#14532d" },
  "Parcelles identifiées":    { icon: MapPin,     color: "#84cc16" },
  "Arbres plantés":           { icon: Sprout,     color: "#65a30d" },
  "Espèces plantées":         { icon: Leaf,       color: "#4d7c0f" },
  "Superficie plantée":       { icon: MapPin,     color: "#3f6212" },
  "Missions réalisées":              { icon: ClipboardList,  color: "#f59e0b" },
  "Signalements de menaces":         { icon: ShieldAlert,    color: "#d97706" },
  "Types de menaces":                { icon: AlertTriangle,  color: "#b45309" },
  "Nombre total d'indices":          { icon: Hash,           color: "#b45309" },
  "Moyenne d'indices par observation": { icon: Hash,         color: "#92400e" },
  "Diversité des indices de pression": { icon: Search,       color: "#78350f" },
  "Score moyen de gravité":          { icon: AlertTriangle,  color: "#dc2626" },
  "Taux de menaces graves":          { icon: ShieldAlert,    color: "#b91c1c" },
  "Score d'activité (ancienneté)":   { icon: Timer,          color: "#9a3412" },
  "Taux de menaces récentes":        { icon: Timer,          color: "#c2410c" },
  "Indice de pression brut":         { icon: BarChart3,      color: "#ea580c" },
  "Indice de pression active":       { icon: BarChart3,      color: "#d97706" },
  "Menaces géolocalisées":           { icon: MapPinned,      color: "#0d9488" },
  "Taux de menaces géolocalisées":   { icon: MapPinned,      color: "#0f766e" },
  "Observations par mission":        { icon: Eye,            color: "#f59e0b" },
  "Taux observations avec commentaire": { icon: FileText,    color: "#78350f" },
  "Taux missions avec signature":    { icon: CheckCircle2,   color: "#065f46" },
  "Taux missions avec photo équipe": { icon: Camera,         color: "#9d174d" },
};

// Section d'indicateurs pour un formulaire (réutilisée dans plusieurs onglets)
function FormIndicatorsSection({
  formData,
  showHeader = true,
}: {
  formData: import("@/lib/api").FormIndicators;
  showHeader?: boolean;
}) {
  const meta = FORM_META[formData.form_key];
  const FormIcon = meta?.icon ?? FileText;
  const formColor = meta?.color ?? "#6b7280";
  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ backgroundColor: `${formColor}20` }}
          >
            <FormIcon className="h-4 w-4" style={{ color: formColor }} />
          </div>
          <h3 className="text-sm font-semibold">{meta?.label ?? formData.form_name}</h3>
          <Badge variant="outline" className="text-[10px] h-5">
            {formData.total_submissions} observations
          </Badge>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {formData.indicators.map((ind) => {
          const indMeta = INDICATOR_META[ind.indicator_name];
          const IndIcon = indMeta?.icon ?? Database;
          const indColor = indMeta?.color ?? formColor;
          return (
            <Card key={ind.indicator_name} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${indColor}18` }}
                  >
                    <IndIcon className="h-4.5 w-4.5" style={{ color: indColor }} />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold leading-none">
                    {typeof ind.value === "number"
                      ? ind.value.toLocaleString("fr-FR")
                      : ind.value}
                    {ind.unit === "ha" && (
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        Ha
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">
                    {ind.indicator_name}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vue multi-graphiques dédiée au suivi de la faune ─────────
// Sépare les indicateurs en catégories thématiques avec des
// types de graphiques différents (radar, donut, barres, pie).

// Catégorie de marqueur déduite du label (type_observation Kobo)
type ObsKind = "directe" | "indice" | "point_eau";

const KIND_META: Record<ObsKind, { color: string; label: string; bg: string }> = {
  directe: { color: "#16a34a", label: "Observation directe", bg: "bg-green-600" },
  indice: { color: "#7c3aed", label: "Indice", bg: "bg-violet-600" },
  point_eau: { color: "#0284c7", label: "Point d'eau", bg: "bg-sky-600" },
};

function resolveKind(label: string | null): ObsKind {
  const l = (label ?? "").toLowerCase();
  if (l.includes("point_eau") || l.includes("eau")) return "point_eau";
  if (l.includes("indice")) return "indice";
  return "directe";
}

// Cadre la carte sur les markers
function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    const bounds: LatLngBoundsExpression = points;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [points, map]);
  return null;
}

// Carte enrichie des observations géolocalisées (faune + points d'eau)
function FauneObservationsMap() {
  const [locs, setLocs] = useState<SubmissionLocation[]>([]);
  const [forets, setForets] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<ObsKind, boolean>>({
    directe: true,
    indice: true,
    point_eau: true,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getLocations("monitoring_faune"),
      getForetsGeoJSON().catch(() => null),
    ])
      .then(([locResp, geo]) => {
        if (cancelled) return;
        setLocs(locResp.locations ?? []);
        setForets(geo);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Enrichissement + filtrage
  const enriched = useMemo(
    () => locs.map((l) => ({ ...l, kind: resolveKind(l.label) })),
    [locs],
  );
  const filtered = useMemo(
    () => enriched.filter((l) => visible[l.kind]),
    [enriched, visible],
  );
  const counts = useMemo(() => {
    const c: Record<ObsKind, number> = { directe: 0, indice: 0, point_eau: 0 };
    enriched.forEach((l) => {
      c[l.kind] += 1;
    });
    return c;
  }, [enriched]);

  const fitPoints: LatLngTuple[] = useMemo(
    () => filtered.map((l) => [l.latitude, l.longitude] as LatLngTuple),
    [filtered],
  );

  const toggle = (k: ObsKind) =>
    setVisible((v) => ({ ...v, [k]: !v[k] }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan-600" />
              Carte des observations
            </CardTitle>
            <CardDescription>
              {loading
                ? "Chargement des points GPS…"
                : error
                  ? `Erreur : ${error}`
                  : `${filtered.length} / ${enriched.length} point${enriched.length > 1 ? "s" : ""} affiché${filtered.length > 1 ? "s" : ""}`}
            </CardDescription>
          </div>
          {/* Filtres par type d'observation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(KIND_META) as ObsKind[]).map((k) => {
              const meta = KIND_META[k];
              const active = visible[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggle(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "bg-card border-border text-foreground"
                      : "bg-muted text-muted-foreground line-through"
                  }`}
                  style={active ? { borderColor: meta.color } : undefined}
                  title={`Basculer ${meta.label}`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  {meta.label}
                  <Badge
                    variant="secondary"
                    className="h-4 px-1.5 text-[10px] tabular-nums"
                  >
                    {counts[k]}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-96 w-full overflow-hidden rounded-b-xl border-t">
          <MapContainer
            center={[6.8, -5.5]}
            zoom={7}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite (Esri)">
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Topographique">
                <TileLayer
                  attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
              {forets && (
                <LayersControl.Overlay checked name="Forêts communautaires">
                  <GeoJSON
                    data={forets}
                    style={{
                      color: "#0d9488",
                      weight: 2,
                      fillColor: "#14b8a6",
                      fillOpacity: 0.12,
                    }}
                    onEachFeature={(feature, layer) => {
                      const name =
                        feature?.properties?.nom ??
                        feature?.properties?.name ??
                        feature?.properties?.Nom ??
                        "Forêt";
                      layer.bindTooltip(String(name), {
                        sticky: true,
                        direction: "top",
                      });
                    }}
                  />
                </LayersControl.Overlay>
              )}
            </LayersControl>

            <ScaleControl position="bottomleft" imperial={false} />

            <FitBounds points={fitPoints} />

            {filtered.map((loc, idx) => {
              const meta = KIND_META[loc.kind];
              return (
                <CircleMarker
                  key={`${loc.submission_id}-${idx}`}
                  center={[loc.latitude, loc.longitude]}
                  radius={8}
                  pathOptions={{
                    color: meta.color,
                    fillColor: meta.color,
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[180px]">
                      <div className="flex items-center gap-1.5 pb-1 border-b border-border">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="font-semibold">{meta.label}</span>
                      </div>
                      {loc.label && (
                        <div className="font-medium capitalize">{loc.label}</div>
                      )}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <span className="text-muted-foreground">Lat</span>
                        <span className="tabular-nums">{loc.latitude.toFixed(5)}</span>
                        <span className="text-muted-foreground">Lon</span>
                        <span className="tabular-nums">{loc.longitude.toFixed(5)}</span>
                        {loc.altitude != null && (
                          <>
                            <span className="text-muted-foreground">Alt</span>
                            <span className="tabular-nums">{loc.altitude.toFixed(0)} m</span>
                          </>
                        )}
                        {loc.accuracy != null && (
                          <>
                            <span className="text-muted-foreground">Précision</span>
                            <span className="tabular-nums">±{loc.accuracy.toFixed(0)} m</span>
                          </>
                        )}
                        {loc.submitted_at && (
                          <>
                            <span className="text-muted-foreground">Date</span>
                            <span className="tabular-nums">
                              {loc.submitted_at.slice(0, 10)}
                            </span>
                          </>
                        )}
                      </div>
                      {loc.image_url && (() => {
                        const authedUrl = withAuthQuery(loc.image_url);
                        return (
                          <a
                            href={authedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block mt-1"
                          >
                            <img
                              src={authedUrl}
                              alt="Observation"
                              className="w-full h-24 object-cover rounded-md border border-border"
                              loading="lazy"
                            />
                          </a>
                        );
                      })()}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const FAUNE_TAXON_INDICATORS = [
  "Mammifères observés",
  "Oiseaux observés",
  "Reptiles observés",
  "Amphibiens observés",
  "Invertébrés observés",
  "Rongeurs observés",
];
const FAUNE_MISSION_INDICATORS = [
  "Suivis fauniques",
  "Missions Zaranou",
  "Missions Apouéba",
  "Jours d'enquête",
  "Écogardes mobilisés",
  "Photos d'équipe",
];
const FAUNE_VOLUMETRY_INDICATORS = [
  "Observations faune",
  "Espèces identifiées",
  "Indices relevés",
  "Individus / indices recensés",
  "Photos d'observation",
  "Observations géolocalisées",
];
const FAUNE_WATER_INDICATORS = [
  "Points d'eau relevés",
  "Points d'eau géolocalisés",
  "Photos de points d'eau",
];

const TAXON_PALETTE = [
  "#0ea5e9",
  "#06b6d4",
  "#0891b2",
  "#0e7490",
  "#155e75",
  "#164e63",
];
const WATER_PALETTE = ["#0284c7", "#0369a1", "#0891b2"];

function pickIndicators(
  indicators: KpiIndicator[],
  names: string[],
): Array<{ name: string; value: number; fill: string }> {
  return names
    .map((n) => indicators.find((i) => i.indicator_name === n))
    .filter((i): i is KpiIndicator => !!i && typeof i.value === "number")
    .map((i) => ({
      name: i.indicator_name,
      value: i.value as number,
      fill: INDICATOR_META[i.indicator_name]?.color ?? "#22d3ee",
    }));
}

function FauneChartsBreakdown({
  indicators,
  forestLabel,
}: {
  indicators: KpiIndicator[];
  forestLabel: string | null;
}) {
  const suffix = forestLabel ? ` — ${forestLabel}` : "";

  // Fetch des distributions détaillées (top espèces, indices, Jaccard, …)
  const [breakdowns, setBreakdowns] = useState<FauneBreakdowns | null>(null);
  const [breakdownsError, setBreakdownsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBreakdownsError(null);
    getFauneBreakdowns()
      .then((data) => {
        if (!cancelled) setBreakdowns(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setBreakdownsError(err?.message ?? "Erreur de chargement");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Répartition par taxon (donut)
  const taxonData = pickIndicators(indicators, FAUNE_TAXON_INDICATORS)
    .map((d, idx) => ({ ...d, fill: TAXON_PALETTE[idx % TAXON_PALETTE.length] }))
    .filter((d) => d.value > 0);
  const taxonTotal = taxonData.reduce((s, d) => s + d.value, 0);

  // 2. Niveau de certitude (pie)
  const certitudeData = pickIndicators(indicators, [
    "Observations certaines",
    "Observations probables",
  ]).filter((d) => d.value > 0);

  // 3. Type d'observation (pie)
  const typeObsData = pickIndicators(indicators, [
    "Observations directes",
    "Observations par indices",
  ]).filter((d) => d.value > 0);

  // 4. Mission & équipe (radar)
  const missionRaw = pickIndicators(indicators, FAUNE_MISSION_INDICATORS);
  const missionMax = Math.max(1, ...missionRaw.map((d) => d.value));
  const missionData = missionRaw.map((d) => ({
    indicator: d.name.replace("Missions ", "").replace("Photos d'équipe", "Photos équipe"),
    value: d.value,
    normalized: Math.round((d.value / missionMax) * 100),
    fullMark: 100,
  }));

  // 5. Volumétrie des observations (bar horizontal-like vertical)
  const volumetryData = pickIndicators(indicators, FAUNE_VOLUMETRY_INDICATORS);

  // 6. Points d'eau (bar)
  const waterData = pickIndicators(indicators, FAUNE_WATER_INDICATORS).map(
    (d, idx) => ({ ...d, fill: WATER_PALETTE[idx % WATER_PALETTE.length] }),
  );

  const tooltipStyle = {
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-card-foreground)",
  } as const;
  const tooltipItemStyle = { color: "var(--color-card-foreground)" } as const;
  const tooltipLabelStyle = {
    color: "var(--color-card-foreground)",
    fontWeight: 600,
  } as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Carte simple des observations géolocalisées */}
      <FauneObservationsMap />

      {/* Volumétrie globale */}
      {volumetryData.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Volumétrie des observations{suffix}</CardTitle>
            <CardDescription>Effort de collecte et richesse des données</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumetryData} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  stroke="var(--color-border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {volumetryData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Répartition par taxon (donut) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Répartition par taxon{suffix}</CardTitle>
          <CardDescription>
            {taxonTotal > 0
              ? `${taxonTotal} observation${taxonTotal > 1 ? "s" : ""} ventilée${taxonTotal > 1 ? "s" : ""}`
              : "Aucune observation enregistrée"}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {taxonData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taxonData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  label={({ name, value }) => `${name.split(" ")[0]} (${value})`}
                  labelLine={false}
                >
                  {taxonData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  iconType="circle"
                  verticalAlign="bottom"
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune observation par taxon
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mission & équipe (radar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mission &amp; équipe{suffix}</CardTitle>
          <CardDescription>Profil normalisé de l'effort de terrain</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {missionData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={missionData} outerRadius="75%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="indicator"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <Radar
                  name="Effort"
                  dataKey="normalized"
                  stroke="#7c3aed"
                  fill="#7c3aed"
                  fillOpacity={0.45}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(_v, _n, item) => {
                    const raw = (item?.payload as { value?: number })?.value ?? 0;
                    return [raw, "Valeur"];
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Données de mission indisponibles
            </div>
          )}
        </CardContent>
      </Card>

      {/* Niveau de certitude (pie) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Niveau de certitude{suffix}</CardTitle>
          <CardDescription>Fiabilité déclarée des observations</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {certitudeData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
                <Pie
                  data={certitudeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {certitudeData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: number, name: string) => [value, name]}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée de certitude
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type d'observation (pie) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Type d'observation{suffix}</CardTitle>
          <CardDescription>Observations directes vs relevés d'indices</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {typeObsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
                <Pie
                  data={typeObsData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {typeObsData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: number, name: string) => [value, name]}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée de type d'observation
            </div>
          )}
        </CardContent>
      </Card>

      {/* Points d'eau (bar) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Points d'eau{suffix}</CardTitle>
          <CardDescription>Relevés hydrologiques associés aux missions</CardDescription>
        </CardHeader>
        <CardContent className="h-56">
          {waterData.length > 0 && waterData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  width={150}
                  stroke="var(--color-border)"
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {waterData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucun point d'eau relevé
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Sections enrichies (distributions, similarité, hydro) ─── */}
      {breakdownsError && (
        <Card className="lg:col-span-2 border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">
            Impossible de charger les distributions détaillées : {breakdownsError}
          </CardContent>
        </Card>
      )}

      {breakdowns && (
        <>
          {/* KPI cards en haut de la section enrichie */}
          <Card className="lg:col-span-2">
            <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Durée totale collecte</span>
                <span className="text-xl font-semibold">{breakdowns.duree_totale_heures} h</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Indice abondance horaire</span>
                <span className="text-xl font-semibold">{breakdowns.indice_abondance_horaire}</span>
                <span className="text-[10px] text-muted-foreground">indiv. + indices / heure</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Espèces uniques</span>
                <span className="text-xl font-semibold">{breakdowns.top_species.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Groupes taxonomiques</span>
                <span className="text-xl font-semibold">{breakdowns.groups.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Top espèces (par fréquence d'observation) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top espèces observées{suffix}</CardTitle>
              <CardDescription>
                Nombre d'observations distinctes par espèce (nom usuel)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {breakdowns.top_species.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.top_species.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={120} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" fill="#16a34a" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune espèce</div>
              )}
            </CardContent>
          </Card>

          {/* Abondance brute par espèce */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Abondance brute par espèce{suffix}</CardTitle>
              <CardDescription>
                Somme des individus ou indices déclarés par espèce
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {breakdowns.abundance_by_species.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.abundance_by_species.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={120} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
              )}
            </CardContent>
          </Card>

          {/* Indices fréquents */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Indices de présence fréquents{suffix}</CardTitle>
              <CardDescription>
                Décompte des indices relevés (cris, traces, fientes…)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {breakdowns.indices.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.indices.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={130} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" fill="#f59e0b" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucun indice</div>
              )}
            </CardContent>
          </Card>

          {/* Indice dominant par groupe */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Indice dominant par groupe{suffix}</CardTitle>
              <CardDescription>L'indice le plus fréquemment relevé pour chaque groupe</CardDescription>
            </CardHeader>
            <CardContent>
              {breakdowns.indice_dominant_par_groupe.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {breakdowns.indice_dominant_par_groupe.map((row, i) => (
                    <li key={i} className="flex items-center justify-between border-b border-border/40 pb-1">
                      <span className="font-medium capitalize">{row.group}</span>
                      <span className="text-muted-foreground">{row.indice}</span>
                      <span className="text-xs tabular-nums">{row.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">Aucun indice par groupe</div>
              )}
            </CardContent>
          </Card>

          {/* Richesse spécifique par forêt */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Richesse spécifique par forêt</CardTitle>
              <CardDescription>Nombre d'espèces distinctes recensées par site</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {breakdowns.richesse_by_forest.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.richesse_by_forest}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
              )}
            </CardContent>
          </Card>

          {/* Richesse par groupe taxonomique */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Richesse par groupe taxonomique</CardTitle>
              <CardDescription>Nombre d'espèces distinctes par groupe</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {breakdowns.richesse_by_group.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.richesse_by_group}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" fill="#a855f7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
              )}
            </CardContent>
          </Card>

          {/* Composition par forêt × groupe (pourcentage) */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Composition faunique par forêt</CardTitle>
              <CardDescription>
                Répartition des observations par groupe taxonomique (%) — chaque ligne représente une forêt
              </CardDescription>
            </CardHeader>
            <CardContent>
              {breakdowns.composition_by_forest_group.length > 0 ? (
                <div className="space-y-3">
                  {Array.from(new Set(breakdowns.composition_by_forest_group.map((c) => c.forest))).map((forest) => {
                    const rows = breakdowns.composition_by_forest_group.filter((c) => c.forest === forest);
                    return (
                      <div key={forest}>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span className="font-medium">{forest}</span>
                          <span>{rows.reduce((s, r) => s + r.value, 0)} obs.</span>
                        </div>
                        <div className="flex h-6 w-full overflow-hidden rounded-md border border-border/40">
                          {rows.map((r, i) => (
                            <div
                              key={i}
                              title={`${r.group} — ${r.value} (${r.pct}%)`}
                              style={{
                                width: `${r.pct}%`,
                                backgroundColor: TAXON_PALETTE[i % TAXON_PALETTE.length],
                              }}
                              className="flex items-center justify-center text-[10px] text-white font-medium"
                            >
                              {r.pct >= 12 ? `${r.group} ${r.pct}%` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Aucune composition disponible</div>
              )}
            </CardContent>
          </Card>

          {/* Ratio observations / points d'eau */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ratio observations / points d'eau</CardTitle>
              <CardDescription>obs ÷ points d'eau (par forêt)</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {breakdowns.ratio_observations_points_eau.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.ratio_observations_points_eau.map((r) => ({ forest: r.forest, ratio: r.ratio ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="forest" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="ratio" fill="#0891b2" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucun ratio calculable</div>
              )}
            </CardContent>
          </Card>

          {/* Distance moyenne aux points d'eau */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Distance observations ↔ point d'eau le plus proche</CardTitle>
              <CardDescription>Moyenne / min / max en mètres (Haversine)</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {breakdowns.mean_distance_to_water.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.mean_distance_to_water}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="forest" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="mean_distance_m" name="moyenne (m)" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="min_distance_m" name="min (m)" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="max_distance_m" name="max (m)" fill="#f97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucune observation géoréférencée à proximité de points d'eau
                </div>
              )}
            </CardContent>
          </Card>

          {/* Similarité Jaccard inter-forêts */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Similarité faunique entre forêts (Jaccard)</CardTitle>
              <CardDescription>
                Indice de Jaccard = espèces communes ÷ espèces totales (0 = aucune commune, 1 = identiques)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {breakdowns.jaccard_pairs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border/40">
                        <th className="text-left py-1">Forêt A</th>
                        <th className="text-left py-1">Forêt B</th>
                        <th className="text-right py-1">Esp. A</th>
                        <th className="text-right py-1">Esp. B</th>
                        <th className="text-right py-1">Communes</th>
                        <th className="text-right py-1">Jaccard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdowns.jaccard_pairs.map((p, i) => (
                        <tr key={i} className="border-b border-border/20">
                          <td className="py-1 font-medium">{p.forest_a}</td>
                          <td className="py-1 font-medium">{p.forest_b}</td>
                          <td className="text-right tabular-nums">{p.species_a}</td>
                          <td className="text-right tabular-nums">{p.species_b}</td>
                          <td className="text-right tabular-nums">{p.common}</td>
                          <td className="text-right tabular-nums font-semibold">{p.jaccard.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Pas assez de forêts pour calculer une similarité</div>
              )}
            </CardContent>
          </Card>

          {/* Durée de collecte par forêt */}
          {breakdowns.duree_par_foret.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Durée de collecte par forêt</CardTitle>
                <CardDescription>Heures cumulées de mission par site</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdowns.duree_par_foret}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="forest" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" name="heures" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Vue multi-graphiques dédiée au suivi du reboisement ──────

const REB_HEALTH_INDICATORS = [
  "Arbres vivants",
  "Arbres morts",
  "Arbres dégradés",
];
const REB_FOREST_INDICATORS = ["Missions Zaranou", "Missions Apouéba"];
const REB_VOLUMETRY_INDICATORS = [
  "Missions de reboisement",
  "Arbres monitorés",
  "Parcelles inventoriées",
  "Espèces inventoriées",
  "Espèces locales",
];
const REB_EFFORT_INDICATORS = [
  "Missions de reboisement",
  "Jours d'enquête",
  "Écogardes mobilisés",
  "Responsables de mission",
  "Photos d'arbres",
  "Photos d'équipe (reboisement)",
];
const REB_DEGRADATION_INDICATORS = [
  "Arbres avec dégradation",
  "Facteurs de dégradation",
  "Signalements de dégradation",
];
const REB_GPS_INDICATORS = ["Arbres géolocalisés", "Précision GPS moyenne"];

const HEALTH_PALETTE: Record<string, string> = {
  "Arbres vivants": "#16a34a",
  "Arbres morts": "#b91c1c",
  "Arbres dégradés": "#ea580c",
};
const FOREST_PALETTE: Record<string, string> = {
  "Missions Zaranou": "#0d9488",
  "Missions Apouéba": "#0f766e",
};
const REB_VOLUMETRY_PALETTE = [
  "#16a34a",
  "#15803d",
  "#65a30d",
  "#14532d",
  "#166534",
];
const REB_DEGRADATION_PALETTE = ["#c2410c", "#9a3412", "#7c2d12"];
const REB_SPECIES_PALETTE = [
  "#15803d",
  "#16a34a",
  "#22c55e",
  "#4ade80",
  "#65a30d",
  "#84cc16",
  "#a3e635",
  "#0d9488",
  "#14b8a6",
  "#2dd4bf",
];
const REB_FACTOR_PALETTE = [
  "#c2410c",
  "#ea580c",
  "#f97316",
  "#fb923c",
  "#fdba74",
  "#9a3412",
  "#7c2d12",
];

// ─── Carte de suivi du reboisement ────────────────────────────
// Affiche les points GPS de tous les arbres reboisés enregistrés
// dans monitoring_reboisement, avec popup détaillé.
function ReboisementObservationsMap({ forestLabel }: { forestLabel: string | null }) {
  const [locs, setLocs] = useState<SubmissionLocation[]>([]);
  const [forets, setForets] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getLocations("monitoring_reboisement"),
      getForetsGeoJSON().catch(() => null),
    ])
      .then(([locResp, geo]) => {
        if (cancelled) return;
        setLocs(locResp.locations ?? []);
        setForets(geo);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Couleur du marqueur en fonction de l'état sanitaire détecté dans le label.
  const colorFor = (label: string | null): string => {
    const l = (label ?? "").toLowerCase();
    if (l.includes("mort")) return "#b91c1c";
    if (l.includes("dégradé") || l.includes("degrade") || l.includes("malade")) return "#ea580c";
    return "#16a34a"; // vivant / par défaut
  };

  const fitPoints: LatLngTuple[] = useMemo(
    () => locs.map((l) => [l.latitude, l.longitude] as LatLngTuple),
    [locs],
  );

  const suffix = forestLabel ? ` — ${forestLabel}` : "";

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              Carte de suivi du reboisement{suffix}
            </CardTitle>
            <CardDescription>
              {loading
                ? "Chargement des points GPS…"
                : error
                  ? `Erreur : ${error}`
                  : `${locs.length} arbre${locs.length > 1 ? "s" : ""} géolocalisé${locs.length > 1 ? "s" : ""}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#16a34a" }} />
              Vivant
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ea580c" }} />
              Dégradé
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#b91c1c" }} />
              Mort
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-96 w-full overflow-hidden rounded-b-xl border-t">
          <MapContainer
            center={[6.8, -5.5]}
            zoom={7}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite (Esri)">
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Topographique">
                <TileLayer
                  attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
              {forets && (
                <LayersControl.Overlay checked name="Forêts communautaires">
                  <GeoJSON
                    data={forets}
                    style={{
                      color: "#0d9488",
                      weight: 2,
                      fillColor: "#14b8a6",
                      fillOpacity: 0.12,
                    }}
                    onEachFeature={(feature, layer) => {
                      const name =
                        feature?.properties?.nom ??
                        feature?.properties?.name ??
                        feature?.properties?.Nom ??
                        "Forêt";
                      layer.bindTooltip(String(name), { sticky: true, direction: "top" });
                    }}
                  />
                </LayersControl.Overlay>
              )}
            </LayersControl>

            <ScaleControl position="bottomleft" imperial={false} />

            <FitBounds points={fitPoints} />

            {locs.map((loc, idx) => {
              const color = colorFor(loc.label);
              return (
                <CircleMarker
                  key={`${loc.submission_id}-${idx}`}
                  center={[loc.latitude, loc.longitude]}
                  radius={7}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[180px]">
                      <div className="flex items-center gap-1.5 pb-1 border-b border-border">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold">Arbre reboisé</span>
                      </div>
                      {loc.label && (
                        <div className="font-medium capitalize">{loc.label}</div>
                      )}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <span className="text-muted-foreground">Lat</span>
                        <span className="tabular-nums">{loc.latitude.toFixed(5)}</span>
                        <span className="text-muted-foreground">Lon</span>
                        <span className="tabular-nums">{loc.longitude.toFixed(5)}</span>
                        {loc.altitude != null && (
                          <>
                            <span className="text-muted-foreground">Alt</span>
                            <span className="tabular-nums">{loc.altitude.toFixed(0)} m</span>
                          </>
                        )}
                        {loc.accuracy != null && (
                          <>
                            <span className="text-muted-foreground">Précision</span>
                            <span className="tabular-nums">±{loc.accuracy.toFixed(0)} m</span>
                          </>
                        )}
                        {loc.submitted_at && (
                          <>
                            <span className="text-muted-foreground">Date</span>
                            <span className="tabular-nums">
                              {loc.submitted_at.slice(0, 10)}
                            </span>
                          </>
                        )}
                      </div>
                      {loc.image_url && (() => {
                        const authedUrl = withAuthQuery(loc.image_url);
                        return (
                          <a
                            href={authedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block mt-1"
                          >
                            <img
                              src={authedUrl}
                              alt="Arbre reboisé"
                              className="w-full h-24 object-cover rounded-md border border-border"
                              loading="lazy"
                            />
                          </a>
                        );
                      })()}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ReboisementChartsBreakdown({
  indicators,
  forestLabel,
}: {
  indicators: KpiIndicator[];
  forestLabel: string | null;
}) {
  const suffix = forestLabel ? ` — ${forestLabel}` : "";

  // Fetch des distributions détaillées (top espèces, facteurs, …)
  const [breakdowns, setBreakdowns] = useState<ReboisementBreakdowns | null>(null);
  const [breakdownsError, setBreakdownsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBreakdownsError(null);
    getReboisementBreakdowns()
      .then((data) => {
        if (!cancelled) setBreakdowns(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setBreakdownsError(err?.message ?? "Erreur de chargement");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. État sanitaire (donut)
  const healthData = pickIndicators(indicators, REB_HEALTH_INDICATORS)
    .map((d) => ({ ...d, fill: HEALTH_PALETTE[d.name] ?? d.fill }))
    .filter((d) => d.value > 0);
  const healthTotal = healthData.reduce((s, d) => s + d.value, 0);

  // 2. Répartition par forêt (pie)
  const forestData = pickIndicators(indicators, REB_FOREST_INDICATORS)
    .map((d) => ({
      ...d,
      name: d.name.replace("Missions ", ""),
      fill: FOREST_PALETTE[d.name] ?? d.fill,
    }))
    .filter((d) => d.value > 0);

  // 3. Volumétrie (bar)
  const volumetryData = pickIndicators(indicators, REB_VOLUMETRY_INDICATORS).map(
    (d, idx) => ({ ...d, fill: REB_VOLUMETRY_PALETTE[idx % REB_VOLUMETRY_PALETTE.length] }),
  );

  // 4. Effort terrain (radar normalisé)
  const effortRaw = pickIndicators(indicators, REB_EFFORT_INDICATORS);
  const effortMax = Math.max(1, ...effortRaw.map((d) => d.value));
  const effortData = effortRaw.map((d) => ({
    indicator: d.name
      .replace("Photos d'équipe (reboisement)", "Photos équipe")
      .replace("Missions de reboisement", "Missions")
      .replace("Responsables de mission", "Responsables"),
    value: d.value,
    normalized: Math.round((d.value / effortMax) * 100),
    fullMark: 100,
  }));

  // 5. Dégradation (horizontal bar)
  const degradationData = pickIndicators(indicators, REB_DEGRADATION_INDICATORS).map(
    (d, idx) => ({ ...d, fill: REB_DEGRADATION_PALETTE[idx % REB_DEGRADATION_PALETTE.length] }),
  );

  // 6. GPS / Précision (bar)
  const gpsData = pickIndicators(indicators, REB_GPS_INDICATORS);

  const tooltipStyle = {
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-card-foreground)",
  } as const;
  const tooltipItemStyle = { color: "var(--color-card-foreground)" } as const;
  const tooltipLabelStyle = {
    color: "var(--color-card-foreground)",
    fontWeight: 600,
  } as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Carte de suivi (points GPS des arbres reboisés) */}
      <ReboisementObservationsMap forestLabel={forestLabel} />

      {/* Volumétrie globale */}
      {volumetryData.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Volumétrie du reboisement{suffix}</CardTitle>
            <CardDescription>Effort de monitoring et richesse spécifique</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumetryData} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  stroke="var(--color-border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {volumetryData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* État sanitaire (donut) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">État sanitaire des arbres{suffix}</CardTitle>
          <CardDescription>
            {healthTotal > 0
              ? `${healthTotal} arbre${healthTotal > 1 ? "s" : ""} évalué${healthTotal > 1 ? "s" : ""}`
              : "Aucun arbre évalué"}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {healthData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={healthData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {healthData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée d'état sanitaire
            </div>
          )}
        </CardContent>
      </Card>

      {/* Répartition par forêt (pie) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Répartition par forêt{suffix}</CardTitle>
          <CardDescription>Missions par forêt communautaire</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {forestData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={forestData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius="80%"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {forestData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune mission enregistrée
            </div>
          )}
        </CardContent>
      </Card>

      {/* Effort terrain (radar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Effort de terrain{suffix}</CardTitle>
          <CardDescription>Profil normalisé des moyens déployés</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {effortData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={effortData} outerRadius="75%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="indicator"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <Radar
                  name="Effort"
                  dataKey="normalized"
                  stroke="#15803d"
                  fill="#15803d"
                  fillOpacity={0.45}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(_v, _n, item) => {
                    const raw = (item?.payload as { value?: number })?.value ?? 0;
                    return [raw, "Valeur"];
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Données d'effort indisponibles
            </div>
          )}
        </CardContent>
      </Card>

      {/* Géolocalisation (bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Géolocalisation des arbres{suffix}</CardTitle>
          <CardDescription>Couverture GPS et précision moyenne</CardDescription>
        </CardHeader>
        <CardContent className="h-60">
          {gpsData.length > 0 && gpsData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gpsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {gpsData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée GPS
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dégradation (bar horizontal) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pression sur les arbres{suffix}</CardTitle>
          <CardDescription>Arbres impactés, types et signalements de dégradation</CardDescription>
        </CardHeader>
        <CardContent className="h-56">
          {degradationData.length > 0 && degradationData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={degradationData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  width={200}
                  stroke="var(--color-border)"
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {degradationData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune dégradation signalée
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top espèces inventoriées */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top espèces inventoriées{suffix}</CardTitle>
          <CardDescription>
            {breakdowns?.top_species?.length
              ? `${breakdowns.top_species.length} espèce${breakdowns.top_species.length > 1 ? "s" : ""} suivie${breakdowns.top_species.length > 1 ? "s" : ""}`
              : "Distribution par nom scientifique"}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {breakdownsError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {breakdownsError}
            </div>
          ) : !breakdowns ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Chargement…
            </div>
          ) : breakdowns.top_species.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={breakdowns.top_species}
                layout="vertical"
                margin={{ left: 20, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)", fontStyle: "italic" }}
                  stroke="var(--color-border)"
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {breakdowns.top_species.map((_, i) => (
                    <Cell key={i} fill={REB_SPECIES_PALETTE[i % REB_SPECIES_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune espèce inventoriée
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facteurs de dégradation détaillés (pie) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Facteurs de dégradation{suffix}</CardTitle>
          <CardDescription>Répartition des causes signalées</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {breakdownsError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {breakdownsError}
            </div>
          ) : !breakdowns ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Chargement…
            </div>
          ) : breakdowns.factors.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdowns.factors}
                  dataKey="value"
                  nameKey="name"
                  outerRadius="78%"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {breakdowns.factors.map((_, i) => (
                    <Cell key={i} fill={REB_FACTOR_PALETTE[i % REB_FACTOR_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value, name) => [value, String(name).replace(/_/g, " ")]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  iconType="circle"
                  formatter={(value) => String(value).replace(/_/g, " ")}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucun facteur signalé
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activité par responsable de mission */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activité par responsable{suffix}</CardTitle>
          <CardDescription>Nombre de missions par chef d'équipe</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {breakdownsError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {breakdownsError}
            </div>
          ) : !breakdowns ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Chargement…
            </div>
          ) : breakdowns.by_responsable.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdowns.by_responsable} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  angle={-25}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                  tickFormatter={(v: string) => v.replace(/_/g, " ")}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  labelFormatter={(label) => String(label).replace(/_/g, " ")}
                />
                <Bar dataKey="value" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucun responsable enregistré
            </div>
          )}
        </CardContent>
      </Card>

      {/* État sanitaire par forêt (stacked bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">État sanitaire par forêt{suffix}</CardTitle>
          <CardDescription>Vivants vs morts vs dégradés, ventilation par site</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {breakdownsError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {breakdownsError}
            </div>
          ) : !breakdowns ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Chargement…
            </div>
          ) : breakdowns.health_by_forest.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdowns.health_by_forest}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="forest"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" />
                <Bar dataKey="vivants" name="Vivants" stackId="health" fill="#16a34a" />
                <Bar dataKey="degrades" name="Dégradés" stackId="health" fill="#ea580c" />
                <Bar dataKey="morts" name="Morts" stackId="health" fill="#b91c1c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée par forêt
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── État sanitaire par espèce (top 15, stacked bar horizontal) ── */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">État sanitaire par espèce{suffix}</CardTitle>
          <CardDescription>Top 15 espèces ventilées par état (vivants / dégradés / morts)</CardDescription>
        </CardHeader>
        <CardContent className="h-96">
          {breakdownsError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{breakdownsError}</div>
          ) : !breakdowns ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chargement…</div>
          ) : breakdowns.health_by_species && breakdowns.health_by_species.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdowns.health_by_species} layout="vertical" margin={{ left: 20, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis type="category" dataKey="espece" width={160} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)", fontStyle: "italic" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" />
                <Bar dataKey="vivants" name="Vivants" stackId="h" fill="#16a34a" />
                <Bar dataKey="degrades" name="Dégradés" stackId="h" fill="#ea580c" />
                <Bar dataKey="morts" name="Morts" stackId="h" fill="#b91c1c" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée d'état sanitaire par espèce
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── État sanitaire par parcelle (top 15, stacked bar) ── */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">État sanitaire par parcelle{suffix}</CardTitle>
          <CardDescription>Effectifs par numéro de parcelle (top 15)</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {breakdownsError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{breakdownsError}</div>
          ) : !breakdowns ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chargement…</div>
          ) : breakdowns.health_by_parcel && breakdowns.health_by_parcel.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdowns.health_by_parcel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="parcelle" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" />
                <Bar dataKey="vivants" name="Vivants" stackId="p" fill="#16a34a" />
                <Bar dataKey="degrades" name="Dégradés" stackId="p" fill="#ea580c" />
                <Bar dataKey="morts" name="Morts" stackId="p" fill="#b91c1c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée d'état sanitaire par parcelle
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Qualité des données de collecte (progress bars) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Qualité de la collecte{suffix}</CardTitle>
          <CardDescription>Complétude des données saisies sur le terrain</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {breakdowns?.quality_metrics ? (
            <>
              {[
                { label: "Photos d'arbres", v: breakdowns.quality_metrics.taux_photo_arbre_pct },
                { label: "Commentaires d'arbres", v: breakdowns.quality_metrics.taux_commentaire_arbre_pct },
                { label: "Photos d'équipe", v: breakdowns.quality_metrics.taux_photo_equipe_pct },
                { label: "Signatures responsables", v: breakdowns.quality_metrics.taux_signature_pct },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.v.toFixed(1)} %</span>
                  </div>
                  <Progress value={Math.min(100, row.v)} />
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground pt-2">
                {breakdowns.quality_metrics.arbres_total} arbre{breakdowns.quality_metrics.arbres_total > 1 ? "s" : ""} sur {breakdowns.quality_metrics.missions_total} mission{breakdowns.quality_metrics.missions_total > 1 ? "s" : ""}
              </p>
            </>
          ) : breakdownsError ? (
            <div className="text-sm text-muted-foreground">{breakdownsError}</div>
          ) : (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          )}
        </CardContent>
      </Card>

      {/* ── Richesse spécifique & facteur dominant ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Richesse spécifique par forêt{suffix}</CardTitle>
          <CardDescription>Nombre d'espèces distinctes recensées + facteur de dégradation dominant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {breakdowns?.richesse_by_forest && breakdowns.richesse_by_forest.length > 0 ? (
            <div className="space-y-2">
              {breakdowns.richesse_by_forest.map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.name}</span>
                  <Badge variant="outline" className="font-mono">{r.value} esp.</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Aucune richesse calculée</div>
          )}
          {breakdowns?.factor_dominant && (
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">Facteur de dégradation dominant</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{breakdowns.factor_dominant.name.replace(/_/g, " ")}</span>
                <Badge className="bg-orange-600 hover:bg-orange-700">
                  {breakdowns.factor_dominant.value} ({breakdowns.factor_dominant.pct.toFixed(1)} %)
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Comparaison entre forêts (Jaccard) ── */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Similarité floristique entre forêts{suffix}</CardTitle>
          <CardDescription>
            Indice de Jaccard (espèces communes ÷ espèces totales) — plus c'est proche de 1, plus les forêts partagent les mêmes espèces
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakdowns?.jaccard_pairs && breakdowns.jaccard_pairs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium">Forêt A</th>
                    <th className="text-left py-2 px-2 font-medium">Forêt B</th>
                    <th className="text-right py-2 px-2 font-medium">Esp. A</th>
                    <th className="text-right py-2 px-2 font-medium">Esp. B</th>
                    <th className="text-right py-2 px-2 font-medium">Communes</th>
                    <th className="text-right py-2 px-2 font-medium">Jaccard</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdowns.jaccard_pairs.map((p, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-2">{p.forest_a}</td>
                      <td className="py-2 px-2">{p.forest_b}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{p.species_a}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{p.species_b}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{p.common}</td>
                      <td className="py-2 px-2 text-right">
                        <Badge
                          className={
                            p.jaccard >= 0.5
                              ? "bg-green-600 hover:bg-green-700"
                              : p.jaccard >= 0.2
                              ? "bg-amber-600 hover:bg-amber-700"
                              : "bg-slate-500 hover:bg-slate-600"
                          }
                        >
                          {p.jaccard.toFixed(3)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Pas assez de forêts comparables (au moins 2 forêts avec espèces requises)
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Suivi des menaces : palettes + composants ─────────────

const MENACES_GRAVITE_PALETTE: Record<string, string> = {
  faible: "#16a34a",
  moyen: "#eab308",
  eleve: "#ea580c",
  tres_eleve: "#b91c1c",
};
const MENACES_GRAVITE_ORDER = ["faible", "moyen", "eleve", "tres_eleve"] as const;
const MENACES_GRAVITE_LABEL: Record<string, string> = {
  faible: "Faible",
  moyen: "Moyen",
  eleve: "Élevé",
  tres_eleve: "Très élevé",
};

const MENACES_ANCIENNETE_PALETTE: Record<string, string> = {
  recent: "#dc2626",
  ancien: "#f59e0b",
  tres_ancien: "#737373",
};
const MENACES_ANCIENNETE_LABEL: Record<string, string> = {
  recent: "Récent",
  ancien: "Ancien",
  tres_ancien: "Très ancien",
};

const MENACES_TYPE_PALETTE = [
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0ea5e9",
  "#16a34a",
  "#ea580c",
  "#db2777",
  "#0d9488",
  "#9333ea",
  "#65a30d",
];

// ─── Suivi des plantations (planting_arbre) ──────────────────
const PLANTING_DONUT_PALETTE = [
  "#16a34a",
  "#65a30d",
  "#0d9488",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#f59e0b",
];
const PLANTING_BAR_PALETTE = [
  "#15803d",
  "#0d9488",
  "#0e7490",
  "#0369a1",
  "#7c3aed",
  "#a21caf",
  "#c026d3",
  "#db2777",
  "#dc2626",
  "#ea580c",
];

function PlantingParcelsMap({ forestLabel }: { forestLabel: string | null }) {
  const [locs, setLocs] = useState<SubmissionLocation[]>([]);
  const [forets, setForets] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getLocations("planting_arbre"),
      getForetsGeoJSON().catch(() => null),
    ])
      .then(([locResp, geo]) => {
        if (cancelled) return;
        setLocs(locResp.locations ?? []);
        setForets(geo);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const colorFor = (label: string | null): string => {
    const l = (label ?? "").toLowerCase();
    if (l.includes("rna")) return "#0d9488";
    if (l.includes("enrichissement")) return "#7c3aed";
    if (l.includes("plantation_pure") || l.includes("pure")) return "#16a34a";
    return "#15803d";
  };

  const fitPoints: LatLngTuple[] = useMemo(
    () => locs.map((l) => [l.latitude, l.longitude] as LatLngTuple),
    [locs],
  );

  const suffix = forestLabel ? ` — ${forestLabel}` : "";

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              Carte des parcelles plantées{suffix}
            </CardTitle>
            <CardDescription>
              {loading
                ? "Chargement des points GPS…"
                : error
                  ? `Erreur : ${error}`
                  : `${locs.length} point${locs.length > 1 ? "s" : ""} géolocalisé${locs.length > 1 ? "s" : ""}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#16a34a" }} />
              Plantation pure
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#7c3aed" }} />
              Enrichissement
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#0d9488" }} />
              RNA
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-96 w-full overflow-hidden rounded-b-xl border-t">
          <MapContainer
            center={[6.8, -5.5]}
            zoom={7}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite (Esri)">
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              {forets && (
                <LayersControl.Overlay checked name="Forêts communautaires">
                  <GeoJSON
                    data={forets}
                    style={{
                      color: "#0d9488",
                      weight: 2,
                      fillColor: "#14b8a6",
                      fillOpacity: 0.12,
                    }}
                  />
                </LayersControl.Overlay>
              )}
            </LayersControl>
            <ScaleControl position="bottomleft" imperial={false} />
            <FitBounds points={fitPoints} />
            {locs.map((loc, idx) => {
              const color = colorFor(loc.label);
              return (
                <CircleMarker
                  key={`${loc.submission_id}-${idx}`}
                  center={[loc.latitude, loc.longitude]}
                  radius={7}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[200px]">
                      <div className="flex items-center gap-1.5 pb-1 border-b border-border">
                        <Sprout className="h-3.5 w-3.5 text-green-700" />
                        <span className="font-semibold">Parcelle plantée</span>
                      </div>
                      {loc.label && (
                        <div className="font-medium capitalize">{loc.label}</div>
                      )}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <span className="text-muted-foreground">Lat</span>
                        <span className="tabular-nums">{loc.latitude.toFixed(5)}</span>
                        <span className="text-muted-foreground">Lon</span>
                        <span className="tabular-nums">{loc.longitude.toFixed(5)}</span>
                        {loc.submitted_at && (
                          <>
                            <span className="text-muted-foreground">Date</span>
                            <span className="tabular-nums">{loc.submitted_at.slice(0, 10)}</span>
                          </>
                        )}
                      </div>
                      {loc.image_url && (
                        <a href={loc.image_url} target="_blank" rel="noreferrer" className="block mt-1">
                          <img
                            src={loc.image_url}
                            alt="Parcelle plantée"
                            className="w-full h-24 object-cover rounded-md border border-border"
                            loading="lazy"
                          />
                        </a>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PlantingChartsBreakdown({
  indicators,
  forestLabel,
}: {
  indicators: KpiIndicator[];
  forestLabel: string | null;
}) {
  const suffix = forestLabel ? ` — ${forestLabel}` : "";
  const [breakdowns, setBreakdowns] = useState<PlantingBreakdowns | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getPlantingBreakdowns()
      .then((data) => {
        if (!cancelled) setBreakdowns(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Erreur de chargement");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tooltipStyle = {
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-card-foreground)",
  } as const;
  const tooltipItemStyle = { color: "var(--color-card-foreground)" } as const;
  const tooltipLabelStyle = {
    color: "var(--color-card-foreground)",
    fontWeight: 600,
  } as const;

  // Volumétrie : indicateurs phares depuis indicators
  const volumetryNames = [
    "Missions de plantation",
    "Parcelles plantées",
    "Arbres plantés (déclarés)",
    "Plants comptés (espèces)",
    "Espèces plantées",
    "Surface plantée totale",
  ];
  const volumetryData = pickIndicators(indicators, volumetryNames).map((d, i) => ({
    ...d,
    fill: PLANTING_BAR_PALETTE[i % PLANTING_BAR_PALETTE.length],
  }));

  const topEspeces = breakdowns?.top_especes ?? [];
  const typeRebData = (breakdowns?.type_reboisement ?? [])
    .map((d, i) => ({ ...d, fill: PLANTING_DONUT_PALETTE[i % PLANTING_DONUT_PALETTE.length] }))
    .filter((d) => d.value > 0);
  const origineData = (breakdowns?.origine_plants ?? [])
    .map((d, i) => ({ ...d, fill: PLANTING_DONUT_PALETTE[i % PLANTING_DONUT_PALETTE.length] }))
    .filter((d) => d.value > 0);
  const organismeDon = breakdowns?.organisme_don ?? [];
  const plantsForest = breakdowns?.plants_par_forest ?? [];
  const surfaceForest = breakdowns?.surface_par_forest ?? [];
  const plantsParcelle = breakdowns?.plants_par_parcelle ?? [];
  const plantsRespons = breakdowns?.plants_par_responsable ?? [];
  const especesForest = breakdowns?.especes_par_forest ?? [];
  const timeline = breakdowns?.timeline ?? [];
  const coherence = breakdowns?.coherence_top ?? [];
  const parcellesDetail = breakdowns?.parcelles_detail ?? [];
  const quality = breakdowns?.quality_metrics ?? null;

  // Données combinées pour graph cohérence (declared vs counted)
  const coherenceChart = coherence.map((r) => ({
    parcelle: r.parcelle,
    Déclarés: r.declares,
    Comptés: r.comptes,
  }));

  // Espèces par forêt → pivot long → wide pour stacked bar par forêt
  const forestSet = Array.from(new Set(especesForest.map((d) => d.forest)));
  const especesNames = Array.from(new Set(especesForest.map((d) => d.espece)));
  const especesParForestWide = forestSet.map((forest) => {
    const row: Record<string, string | number> = { forest };
    especesNames.forEach((esp) => {
      row[esp] =
        especesForest.find((d) => d.forest === forest && d.espece === esp)?.value ?? 0;
    });
    return row;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Carte */}
      <PlantingParcelsMap forestLabel={forestLabel} />

      {error && (
        <Card className="lg:col-span-2 border-amber-200 bg-amber-50/50">
          <CardContent className="py-4 text-sm text-amber-800">
            Distributions détaillées indisponibles : {error}
          </CardContent>
        </Card>
      )}

      {/* Volumétrie */}
      {volumetryData.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Volumétrie des plantations{suffix}</CardTitle>
            <CardDescription>Effort de plantation et richesse spécifique</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumetryData} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  stroke="var(--color-border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {volumetryData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Donut : Type de reboisement */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Type de reboisement{suffix}</CardTitle>
          <CardDescription>Répartition des parcelles par stratégie</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {typeRebData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeRebData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {typeRebData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Donut : Origine des plants */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Origine des plants{suffix}</CardTitle>
          <CardDescription>Pépinière, achat ou don</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {origineData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={origineData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {origineData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top espèces plantées */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top espèces plantées{suffix}</CardTitle>
          <CardDescription>Nombre de plants par espèce (≤ 15)</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {topEspeces.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topEspeces} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="plants" radius={[0, 6, 6, 0]}>
                  {topEspeces.map((_, i) => (
                    <Cell key={i} fill={PLANTING_BAR_PALETTE[i % PLANTING_BAR_PALETTE.length]} />
                  ))}
                  <LabelList dataKey="plants" position="right" style={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune espèce comptée
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plants par forêt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plants par forêt{suffix}</CardTitle>
          <CardDescription>Volume planté par forêt communautaire</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {plantsForest.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plantsForest}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#15803d">
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée
            </div>
          )}
        </CardContent>
      </Card>

      {/* Surface par forêt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Surface plantée par forêt{suffix}</CardTitle>
          <CardDescription>Hectares cumulés</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {surfaceForest.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={surfaceForest}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="forest" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="surface_ha" radius={[6, 6, 0, 0]} fill="#0d9488">
                  <LabelList dataKey="surface_ha" position="top" style={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune surface
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plants par parcelle */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top parcelles par nombre de plants{suffix}</CardTitle>
          <CardDescription>15 parcelles les plus plantées</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {plantsParcelle.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plantsParcelle} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="parcelle"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  stroke="var(--color-border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="plants" radius={[6, 6, 0, 0]}>
                  {plantsParcelle.map((_, i) => (
                    <Cell key={i} fill={PLANTING_BAR_PALETTE[i % PLANTING_BAR_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Aucune parcelle plantée
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cohérence déclarés vs comptés */}
      {coherenceChart.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cohérence déclarés vs comptés{suffix}</CardTitle>
            <CardDescription>Comparaison plants déclarés (saisis) vs comptés (somme des espèces)</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coherenceChart} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="parcelle"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  stroke="var(--color-border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Déclarés" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Comptés" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Timeline missions */}
      {timeline.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calendrier des missions{suffix}</CardTitle>
            <CardDescription>Nombre de missions de plantation par jour</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Line type="monotone" dataKey="missions" stroke="#15803d" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Espèces par forêt (stacked) */}
      {especesParForestWide.length > 0 && especesNames.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Composition spécifique par forêt{suffix}</CardTitle>
            <CardDescription>Plants par espèce et par forêt (top 6)</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={especesParForestWide}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="forest" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {especesNames.map((esp, i) => (
                  <Bar
                    key={esp}
                    dataKey={esp}
                    stackId="esp"
                    fill={PLANTING_BAR_PALETTE[i % PLANTING_BAR_PALETTE.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Plants par responsable */}
      {plantsRespons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Plants par responsable de mission{suffix}</CardTitle>
            <CardDescription>Top 10</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plantsRespons} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Organismes donateurs */}
      {organismeDon.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Organismes donateurs{suffix}</CardTitle>
            <CardDescription>Origine des plants reçus en don</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={organismeDon}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#7c3aed">
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Qualité de collecte */}
      {quality && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Qualité de la collecte{suffix}
            </CardTitle>
            <CardDescription>
              {quality.missions_total} mission{quality.missions_total > 1 ? "s" : ""} ·{" "}
              {quality.plants_total} plants comptés · {quality.plants_declares_total} déclarés
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Photo parcelle", value: quality.taux_photo_parcelle_pct },
              { label: "Délimitation GPS", value: quality.taux_delimitation_pct },
              { label: "GPS centre", value: quality.taux_gps_centre_pct },
              { label: "Photo équipe", value: quality.taux_photo_equipe_pct },
              { label: "Signature", value: quality.taux_signature_pct },
              { label: "Commentaire", value: quality.taux_commentaire_pct },
              { label: "Cohérence plants", value: quality.taux_coherence_pct },
            ].map((q) => (
              <div key={q.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{q.label}</span>
                  <span className="font-semibold tabular-nums">{q.value.toFixed(1)}%</span>
                </div>
                <Progress value={q.value} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Détail des parcelles */}
      {parcellesDetail.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Détail des parcelles plantées{suffix}</CardTitle>
            <CardDescription>{parcellesDetail.length} parcelle{parcellesDetail.length > 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Parcelle</th>
                  <th className="px-3 py-2 font-medium">Forêt</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Responsable</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Origine</th>
                  <th className="px-3 py-2 font-medium text-right">Surface (ha)</th>
                  <th className="px-3 py-2 font-medium text-right">Espèces</th>
                  <th className="px-3 py-2 font-medium text-right">Déclarés</th>
                  <th className="px-3 py-2 font-medium text-right">Comptés</th>
                </tr>
              </thead>
              <tbody>
                {parcellesDetail.map((p, i) => (
                  <tr key={`${p.parcelle}-${i}`} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{p.parcelle}</td>
                    <td className="px-3 py-2">{p.forest}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.date}</td>
                    <td className="px-3 py-2">{p.responsable}</td>
                    <td className="px-3 py-2">{p.type_reboisement}</td>
                    <td className="px-3 py-2">{p.origine_plants}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.surface_ha.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.nb_especes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.plants_declares}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.plants_comptes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MenacesObservationsMap({ forestLabel }: { forestLabel: string | null }) {
  const [locs, setLocs] = useState<SubmissionLocation[]>([]);
  const [forets, setForets] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getLocations("menaces"),
      getForetsGeoJSON().catch(() => null),
    ])
      .then(([locResp, geo]) => {
        if (cancelled) return;
        setLocs(locResp.locations ?? []);
        setForets(geo);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Couleur en fonction du label (qui contient type / gravité / ancienneté
  // selon `_LABEL_KEYS_BY_FORM`).
  const colorFor = (label: string | null): string => {
    const l = (label ?? "").toLowerCase();
    if (l.includes("tres_eleve") || l.includes("très élevé") || l.includes("critique"))
      return MENACES_GRAVITE_PALETTE.tres_eleve;
    if (l.includes("eleve") || l.includes("élevé") || l.includes("high"))
      return MENACES_GRAVITE_PALETTE.eleve;
    if (l.includes("moyen") || l.includes("modere") || l.includes("modéré"))
      return MENACES_GRAVITE_PALETTE.moyen;
    if (l.includes("faible") || l.includes("low"))
      return MENACES_GRAVITE_PALETTE.faible;
    return "#f59e0b"; // défaut menaces
  };

  const fitPoints: LatLngTuple[] = useMemo(
    () => locs.map((l) => [l.latitude, l.longitude] as LatLngTuple),
    [locs],
  );

  const suffix = forestLabel ? ` — ${forestLabel}` : "";

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Carte des menaces signalées{suffix}
            </CardTitle>
            <CardDescription>
              {loading
                ? "Chargement des points GPS…"
                : error
                  ? `Erreur : ${error}`
                  : `${locs.length} menace${locs.length > 1 ? "s" : ""} géolocalisée${locs.length > 1 ? "s" : ""}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {MENACES_GRAVITE_ORDER.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: MENACES_GRAVITE_PALETTE[k] }}
                />
                {MENACES_GRAVITE_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-96 w-full overflow-hidden rounded-b-xl border-t">
          <MapContainer
            center={[6.8, -5.5]}
            zoom={7}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite (Esri)">
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Topographique">
                <TileLayer
                  attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
              {forets && (
                <LayersControl.Overlay checked name="Forêts communautaires">
                  <GeoJSON
                    data={forets}
                    style={{
                      color: "#0d9488",
                      weight: 2,
                      fillColor: "#14b8a6",
                      fillOpacity: 0.12,
                    }}
                    onEachFeature={(feature, layer) => {
                      const name =
                        feature?.properties?.nom ??
                        feature?.properties?.name ??
                        feature?.properties?.Nom ??
                        "Forêt";
                      layer.bindTooltip(String(name), { sticky: true, direction: "top" });
                    }}
                  />
                </LayersControl.Overlay>
              )}
            </LayersControl>

            <ScaleControl position="bottomleft" imperial={false} />
            <FitBounds points={fitPoints} />

            {locs.map((loc, idx) => {
              const color = colorFor(loc.label);
              return (
                <CircleMarker
                  key={`${loc.submission_id}-${idx}`}
                  center={[loc.latitude, loc.longitude]}
                  radius={7}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[180px]">
                      <div className="flex items-center gap-1.5 pb-1 border-b border-border">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold">Menace signalée</span>
                      </div>
                      {loc.label && (
                        <div className="font-medium capitalize">{loc.label}</div>
                      )}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <span className="text-muted-foreground">Lat</span>
                        <span className="tabular-nums">{loc.latitude.toFixed(5)}</span>
                        <span className="text-muted-foreground">Lon</span>
                        <span className="tabular-nums">{loc.longitude.toFixed(5)}</span>
                        {loc.altitude != null && (
                          <>
                            <span className="text-muted-foreground">Alt</span>
                            <span className="tabular-nums">{loc.altitude.toFixed(0)} m</span>
                          </>
                        )}
                        {loc.accuracy != null && (
                          <>
                            <span className="text-muted-foreground">Précision</span>
                            <span className="tabular-nums">±{loc.accuracy.toFixed(0)} m</span>
                          </>
                        )}
                        {loc.submitted_at && (
                          <>
                            <span className="text-muted-foreground">Date</span>
                            <span className="tabular-nums">
                              {loc.submitted_at.slice(0, 10)}
                            </span>
                          </>
                        )}
                      </div>
                      {loc.image_url && (
                        <a
                          href={loc.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block mt-1"
                        >
                          <img
                            src={loc.image_url}
                            alt="Menace observée"
                            className="w-full h-24 object-cover rounded-md border border-border"
                            loading="lazy"
                          />
                        </a>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MenacesChartsBreakdown({
  forestLabel,
}: {
  forestLabel: string | null;
}) {
  const suffix = forestLabel ? ` — ${forestLabel}` : "";

  const [breakdowns, setBreakdowns] = useState<MenacesBreakdowns | null>(null);
  const [breakdownsError, setBreakdownsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBreakdownsError(null);
    getMenacesBreakdowns()
      .then((data) => {
        if (!cancelled) setBreakdowns(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setBreakdownsError(err?.message ?? "Erreur de chargement");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tooltipStyle = {
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-card-foreground)",
  } as const;
  const tooltipItemStyle = { color: "var(--color-card-foreground)" } as const;
  const tooltipLabelStyle = {
    color: "var(--color-card-foreground)",
    fontWeight: 600,
  } as const;

  // ── Préparations basées sur breakdowns ──────────────────
  const summary = breakdowns?.summary;
  const typesPression = (breakdowns?.types_pression ?? []).slice(0, 12).map((t, idx) => ({
    name: t.name,
    value: t.value,
    fill: MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
  }));
  const indicesPression = (breakdowns?.indices_pression ?? []).slice(0, 12);
  const graviteDist = (breakdowns?.gravite_distribution ?? []).map((g) => ({
    name: g.label,
    key: g.niveau_gravite,
    value: g.value,
    fill: MENACES_GRAVITE_PALETTE[g.niveau_gravite] ?? "#94a3b8",
  })).filter((g) => g.value > 0);
  const ancienneteDist = (breakdowns?.anciennete_distribution ?? []).map((a) => ({
    name: a.label,
    key: a.anciennete_indice,
    value: a.value,
    fill: MENACES_ANCIENNETE_PALETTE[a.anciennete_indice] ?? "#94a3b8",
  })).filter((a) => a.value > 0);
  const pressionForest = breakdowns?.pression_par_forest ?? [];
  const prioriteType = (breakdowns?.priorite_par_type ?? []).slice(0, 10);

  // Types par forêt → format stacké
  const typesParForestStacked = useMemo(() => {
    if (!breakdowns) return [] as { type_pression: string; [k: string]: string | number }[];
    const allTypes = Array.from(
      new Set(breakdowns.types_par_forest.map((r) => r.type_pression)),
    );
    const allForests = Array.from(
      new Set(breakdowns.types_par_forest.map((r) => r.forest)),
    );
    return allTypes.map((tp) => {
      const row: { type_pression: string; [k: string]: string | number } = {
        type_pression: tp,
      };
      for (const f of allForests) {
        row[f] = breakdowns.types_par_forest
          .filter((r) => r.type_pression === tp && r.forest === f)
          .reduce((s, r) => s + r.value, 0);
      }
      return row;
    });
  }, [breakdowns]);
  const forestsInGrouped = useMemo(
    () => Array.from(new Set((breakdowns?.types_par_forest ?? []).map((r) => r.forest))),
    [breakdowns],
  );

  // Gravité par type → format stacké
  const graviteParTypeStacked = useMemo(() => {
    if (!breakdowns) return [] as { type_pression: string; [k: string]: string | number }[];
    const allTypes = Array.from(
      new Set(breakdowns.gravite_par_type.map((r) => r.type_pression)),
    );
    return allTypes.map((tp) => {
      const row: { type_pression: string; [k: string]: string | number } = {
        type_pression: tp,
      };
      for (const k of MENACES_GRAVITE_ORDER) {
        row[k] = breakdowns.gravite_par_type
          .filter((r) => r.type_pression === tp && r.niveau_gravite === k)
          .reduce((s, r) => s + r.value, 0);
      }
      return row;
    });
  }, [breakdowns]);

  // Profil radar par forêt (un axe par type, valeurs normalisées 0..100)
  const radarData = useMemo(() => {
    if (!breakdowns) return [] as { type_pression: string; [forest: string]: string | number }[];
    const allTypes = Array.from(
      new Set(breakdowns.radar_profile.map((r) => r.type_pression)),
    );
    const allForests = Array.from(
      new Set(breakdowns.radar_profile.map((r) => r.forest)),
    );
    return allTypes.map((tp) => {
      const row: { type_pression: string; [forest: string]: string | number } = {
        type_pression: tp,
      };
      for (const f of allForests) {
        const match = breakdowns.radar_profile.find(
          (r) => r.type_pression === tp && r.forest === f,
        );
        row[f] = match ? match.normalized : 0;
      }
      return row;
    });
  }, [breakdowns]);
  const forestsInRadar = useMemo(
    () => Array.from(new Set((breakdowns?.radar_profile ?? []).map((r) => r.forest))),
    [breakdowns],
  );

  // Score moyen de gravité par forêt (trié décroissant)
  const scoreGraviteForest = useMemo(
    () =>
      [...(breakdowns?.score_gravite_par_forest ?? [])]
        .sort((a, b) => b.value - a.value)
        .map((r) => ({
          forest: r.forest,
          value: Number(r.value.toFixed(2)),
          fill:
            r.value >= 3
              ? MENACES_GRAVITE_PALETTE.tres_eleve
              : r.value >= 2.5
                ? MENACES_GRAVITE_PALETTE.eleve
                : r.value >= 1.5
                  ? MENACES_GRAVITE_PALETTE.moyen
                  : MENACES_GRAVITE_PALETTE.faible,
        })),
    [breakdowns],
  );

  // Répartition (donut) des types de pression — volume brut d'observations.
  // Top 8 conservés individuellement, le reste agrégé en « Autres ».
  const repartitionPressionParType = useMemo(() => {
    const raw = [...(breakdowns?.pression_par_type ?? [])].sort(
      (a, b) => b.value - a.value,
    );
    const total = raw.reduce((s, r) => s + r.value, 0) || 1;
    const top = raw.slice(0, 8);
    const rest = raw.slice(8);
    const items = top.map((r, idx) => ({
      name: r.type_pression,
      value: r.value,
      share_pct: Number(((r.value / total) * 100).toFixed(1)),
      fill: MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
    }));
    if (rest.length > 0) {
      const restValue = rest.reduce((s, r) => s + r.value, 0);
      items.push({
        name: `Autres (${rest.length})`,
        value: restValue,
        share_pct: Number(((restValue / total) * 100).toFixed(1)),
        fill: MENACES_TYPE_PALETTE[8 % MENACES_TYPE_PALETTE.length],
      });
    }
    return items;
  }, [breakdowns]);

  // Gravité par forêt (stacké)
  const graviteParForestStacked = useMemo(() => {
    if (!breakdowns) return [] as { forest: string; [k: string]: string | number }[];
    const forests = Array.from(
      new Set(breakdowns.gravite_par_forest.map((r) => r.forest)),
    );
    return forests.map((f) => {
      const row: { forest: string; [k: string]: string | number } = { forest: f };
      for (const k of MENACES_GRAVITE_ORDER) {
        row[k] = breakdowns.gravite_par_forest
          .filter((r) => r.forest === f && r.niveau_gravite === k)
          .reduce((s, r) => s + r.value, 0);
      }
      return row;
    });
  }, [breakdowns]);

  // Ancienneté par forêt (stacké)
  const ancienneteParForestStacked = useMemo(() => {
    if (!breakdowns) return [] as { forest: string; [k: string]: string | number }[];
    const order = ["recent", "ancien", "tres_ancien"];
    const forests = Array.from(
      new Set(breakdowns.anciennete_par_forest.map((r) => r.forest)),
    );
    return forests.map((f) => {
      const row: { forest: string; [k: string]: string | number } = { forest: f };
      for (const k of order) {
        row[k] = breakdowns.anciennete_par_forest
          .filter((r) => r.forest === f && r.anciennete_indice === k)
          .reduce((s, r) => s + r.value, 0);
      }
      return row;
    });
  }, [breakdowns]);
  const ancienneteOrder = ["recent", "ancien", "tres_ancien"];

  // Ancienneté par type (stacké)
  const ancienneteParTypeStacked = useMemo(() => {
    if (!breakdowns) return [] as { type_pression: string; [k: string]: string | number }[];
    const types = Array.from(
      new Set(breakdowns.anciennete_par_type.map((r) => r.type_pression)),
    );
    return types.map((tp) => {
      const row: { type_pression: string; [k: string]: string | number } = {
        type_pression: tp,
      };
      for (const k of ancienneteOrder) {
        row[k] = breakdowns.anciennete_par_type
          .filter((r) => r.type_pression === tp && r.anciennete_indice === k)
          .reduce((s, r) => s + r.value, 0);
      }
      return row;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdowns]);

  // Bubble: gravité moyenne × ancienneté moyenne par type (taille = observations)
  const bubbleData = useMemo(() => {
    return (breakdowns?.priorite_par_type ?? [])
      .filter(
        (p) =>
          p.score_moyen_gravite > 0 &&
          p.score_moyen_anciennete > 0 &&
          p.nombre_observations > 0,
      )
      .map((p, idx) => ({
        type_pression: p.type_pression,
        gravite: Number(p.score_moyen_gravite.toFixed(2)),
        anciennete: Number(p.score_moyen_anciennete.toFixed(2)),
        observations: p.nombre_observations,
        fill: MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
      }));
  }, [breakdowns]);

  // Top 8 priorités → RadialBar
  const topPriorites = useMemo(() => {
    return [...(breakdowns?.priorite_par_type ?? [])]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((p, idx) => ({
        name: p.type_pression,
        value: Number(p.score.toFixed(1)),
        fill: MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
      }));
  }, [breakdowns]);

  // Pression brute par type (top 10)
  const pressionParType = useMemo(
    () =>
      [...(breakdowns?.pression_par_type ?? [])]
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [breakdowns],
  );

  // Indices dominants par type
  const indicesDominants = useMemo(
    () =>
      (breakdowns?.indices_dominants_par_type ?? [])
        .filter((r) => r.indice)
        .slice(0, 12),
    [breakdowns],
  );

  // Matrice détail type × indice (depuis le backend)
  const indicesDetail = breakdowns?.indices_detail_par_type ?? [];

  // Liste de tous les indices uniques (utilisé comme stack keys)
  const allIndices = useMemo(
    () => Array.from(new Set(indicesDetail.map((r) => r.indice))),
    [indicesDetail],
  );

  // Stacked bar : types × indices (volume absolu)
  const detailStacked = useMemo(() => {
    const byType = new Map<string, Record<string, number>>();
    for (const r of indicesDetail) {
      const row = byType.get(r.type_pression) ?? {};
      row[r.indice] = (row[r.indice] ?? 0) + r.value;
      byType.set(r.type_pression, row);
    }
    return Array.from(byType.entries())
      .map(([type_pression, vals]) => ({
        type_pression,
        total: Object.values(vals).reduce((a, b) => a + b, 0),
        ...vals,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [indicesDetail]);

  // Drill-down : type sélectionné
  const typesDisponibles = useMemo(
    () =>
      Array.from(
        new Set(indicesDetail.map((r) => r.type_pression)),
      ).sort(),
    [indicesDetail],
  );
  const [selectedTypeMenace, setSelectedTypeMenace] = useState<string>("");
  useEffect(() => {
    if (typesDisponibles.length > 0 && !typesDisponibles.includes(selectedTypeMenace)) {
      setSelectedTypeMenace(typesDisponibles[0]);
    }
  }, [typesDisponibles, selectedTypeMenace]);

  const focusIndices = useMemo(() => {
    return indicesDetail
      .filter((r) => r.type_pression === selectedTypeMenace)
      .map((r, idx) => ({
        name: r.indice,
        value: r.value,
        share: r.share_pct,
        fill: MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
      }));
  }, [indicesDetail, selectedTypeMenace]);

  const focusPriorite = useMemo(
    () =>
      (breakdowns?.priorite_par_type ?? []).find(
        (p) => p.type_pression === selectedTypeMenace,
      ) ?? null,
    [breakdowns, selectedTypeMenace],
  );

  const focusForests = useMemo(() => {
    return (breakdowns?.types_par_forest ?? [])
      .filter((r) => r.type_pression === selectedTypeMenace)
      .sort((a, b) => b.value - a.value);
  }, [breakdowns, selectedTypeMenace]);

  const focusGravite = useMemo(() => {
    return (breakdowns?.gravite_par_type ?? [])
      .filter((r) => r.type_pression === selectedTypeMenace)
      .map((r) => ({
        name: MENACES_GRAVITE_LABEL[r.niveau_gravite] ?? r.niveau_gravite,
        key: r.niveau_gravite,
        value: r.value,
        fill: MENACES_GRAVITE_PALETTE[r.niveau_gravite] ?? "#94a3b8",
      }))
      .filter((r) => r.value > 0);
  }, [breakdowns, selectedTypeMenace]);

  const focusAnciennete = useMemo(() => {
    return (breakdowns?.anciennete_par_type ?? [])
      .filter((r) => r.type_pression === selectedTypeMenace)
      .map((r) => ({
        name: MENACES_ANCIENNETE_LABEL[r.anciennete_indice] ?? r.anciennete_indice,
        key: r.anciennete_indice,
        value: r.value,
        fill: MENACES_ANCIENNETE_PALETTE[r.anciennete_indice] ?? "#94a3b8",
      }))
      .filter((r) => r.value > 0);
  }, [breakdowns, selectedTypeMenace]);

  const jaccard = breakdowns?.jaccard_pairs ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* KPI strip */}
      {summary && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Synthèse pression et menaces{suffix}
            </CardTitle>
            <CardDescription>
              Indicateurs clés du suivi des menaces forestières
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <KpiTile label="Missions" value={summary.missions_total} />
              <KpiTile label="Signalements" value={summary.observations_menaces_total} />
              <KpiTile label="Indices relevés" value={summary.nombre_total_indices} />
              <KpiTile
                label="Score gravité"
                value={summary.score_moyen_gravite}
                suffix="/4"
              />
              <KpiTile
                label="Menaces graves"
                value={summary.taux_menaces_graves_pct}
                suffix="%"
                accent="#b91c1c"
              />
              <KpiTile
                label="Menaces récentes"
                value={summary.taux_menaces_recentes_pct}
                suffix="%"
                accent="#dc2626"
              />
              <KpiTile
                label="Pression active"
                value={summary.indice_pression_active}
                suffix=" pts"
                accent="#7c3aed"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Carte des menaces géolocalisées */}
      <MenacesObservationsMap forestLabel={forestLabel} />

      {breakdownsError && (
        <Card className="lg:col-span-2">
          <CardContent className="py-6 text-sm text-rose-600">
            Impossible de charger les distributions : {breakdownsError}
          </CardContent>
        </Card>
      )}

      {/* Types de pressions (bar horizontal) */}
      {typesPression.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Types de pressions</CardTitle>
            <CardDescription>Nombre d'observations par type</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={typesPression}
                layout="vertical"
                margin={{ left: 16, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {typesPression.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Distribution gravité (donut) */}
      {graviteDist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Répartition par gravité</CardTitle>
            <CardDescription>Niveaux signalés par les écogardes</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={graviteDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {graviteDist.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Distribution ancienneté (donut) */}
      {ancienneteDist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ancienneté des indices</CardTitle>
            <CardDescription>Pression récente vs ancienne</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ancienneteDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {ancienneteDist.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Gravité par type (stacked bar) */}
      {graviteParTypeStacked.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gravité par type de pression</CardTitle>
            <CardDescription>Empilement des niveaux par type</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graviteParTypeStacked} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="type_pression"
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {MENACES_GRAVITE_ORDER.map((k) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={MENACES_GRAVITE_LABEL[k]}
                    stackId="grav"
                    fill={MENACES_GRAVITE_PALETTE[k]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Types par forêt (stacked) */}
      {typesParForestStacked.length > 0 && forestsInGrouped.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pressions par forêt</CardTitle>
            <CardDescription>
              Volume d'observations par type et par forêt
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typesParForestStacked} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="type_pression"
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {forestsInGrouped.map((f, idx) => (
                  <Bar
                    key={f}
                    dataKey={f}
                    stackId="forest"
                    fill={MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Profil radar pression par forêt */}
      {radarData.length >= 3 && forestsInRadar.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Profil de pression par forêt</CardTitle>
            <CardDescription>
              Intensité normalisée (0–100) pour chaque type
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="type_pression" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                {forestsInRadar.map((f, idx) => (
                  <Radar
                    key={f}
                    name={f}
                    dataKey={f}
                    stroke={MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length]}
                    fill={MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length]}
                    fillOpacity={0.25}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Score moyen de gravité par forêt */}
      {scoreGraviteForest.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score moyen de gravité par forêt</CardTitle>
            <CardDescription>
              Échelle 1 (faible) → 4 (très élevé)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={scoreGraviteForest}
                layout="vertical"
                margin={{ left: 16, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 4]} />
                <YAxis dataKey="forest" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {scoreGraviteForest.map((d) => (
                    <Cell key={d.forest} fill={d.fill} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    style={{ fontSize: 11, fill: "var(--color-card-foreground)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Répartition (donut) des types de pression — volume d'observations */}
      {repartitionPressionParType.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Répartition des types de pression
            </CardTitle>
            <CardDescription>
              Part de chaque type dans le volume total d&apos;observations
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: number, _name, entry) => {
                    const pct = (entry?.payload as { share_pct?: number })
                      ?.share_pct;
                    return [`${value} obs (${pct ?? 0}%)`, entry?.payload?.name];
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={48}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Pie
                  data={repartitionPressionParType}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  label={(d: { share_pct?: number }) =>
                    d.share_pct && d.share_pct >= 5 ? `${d.share_pct}%` : ""
                  }
                  labelLine={false}
                >
                  {repartitionPressionParType.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Gravité par forêt (stacked bar) */}
      {graviteParForestStacked.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gravité par forêt</CardTitle>
            <CardDescription>Répartition empilée des niveaux</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graviteParForestStacked} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="forest"
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {MENACES_GRAVITE_ORDER.map((k) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={MENACES_GRAVITE_LABEL[k]}
                    stackId="grav"
                    fill={MENACES_GRAVITE_PALETTE[k]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ancienneté par forêt (stacked bar) */}
      {ancienneteParForestStacked.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ancienneté par forêt</CardTitle>
            <CardDescription>Pressions récentes vs anciennes</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ancienneteParForestStacked} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="forest"
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {ancienneteOrder.map((k) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={MENACES_ANCIENNETE_LABEL[k] ?? k}
                    stackId="anc"
                    fill={MENACES_ANCIENNETE_PALETTE[k] ?? "#94a3b8"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ancienneté par type de pression (stacked bar) */}
      {ancienneteParTypeStacked.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ancienneté par type de pression</CardTitle>
            <CardDescription>
              Identifier les pressions à dynamique récente
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ancienneteParTypeStacked} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="type_pression"
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {ancienneteOrder.map((k) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={MENACES_ANCIENNETE_LABEL[k] ?? k}
                    stackId="anc"
                    fill={MENACES_ANCIENNETE_PALETTE[k] ?? "#94a3b8"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Pression brute par type de pression */}
      {pressionParType.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pression brute par type</CardTitle>
            <CardDescription>
              Indices × gravité (top 10)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pressionParType}
                layout="vertical"
                margin={{ left: 16, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="type_pression" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {pressionParType.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bubble : gravité × ancienneté × volume par type */}
      {bubbleData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cartographie gravité × ancienneté</CardTitle>
            <CardDescription>
              Taille des bulles = nombre d'observations
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 16, bottom: 32, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="gravite"
                  name="Gravité moyenne"
                  domain={[0, 4]}
                  label={{
                    value: "Gravité moyenne (1–4)",
                    position: "bottom",
                    offset: 0,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="anciennete"
                  name="Ancienneté moyenne"
                  domain={[0, 3]}
                  label={{
                    value: "Ancienneté (1=ancienne → 3=récente)",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                  }}
                />
                <ZAxis
                  type="number"
                  dataKey="observations"
                  range={[60, 600]}
                  name="Observations"
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: number | string, name: string) => [value, name]}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as {
                      type_pression: string;
                      gravite: number;
                      anciennete: number;
                      observations: number;
                    };
                    return (
                      <div
                        style={{
                          ...tooltipStyle,
                          padding: 8,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {d.type_pression}
                        </div>
                        <div>Gravité : {d.gravite.toFixed(2)}</div>
                        <div>Ancienneté : {d.anciennete.toFixed(2)}</div>
                        <div>Observations : {d.observations}</div>
                      </div>
                    );
                  }}
                />
                <Scatter name="Types" data={bubbleData}>
                  {bubbleData.map((d) => (
                    <Cell key={d.type_pression} fill={d.fill} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top priorités (RadialBar) */}
      {topPriorites.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top priorités d'intervention</CardTitle>
            <CardDescription>
              Score composite (0–100) des 8 types les plus critiques
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="20%"
                outerRadius="90%"
                barSize={12}
                data={topPriorites}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  angleAxisId={0}
                  tick={false}
                />
                <RadialBar background dataKey="value" cornerRadius={6}>
                  {topPriorites.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </RadialBar>
                <Legend
                  iconSize={10}
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: 11, lineHeight: "16px" }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Indices de pression (table) */}
      {indicesPression.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Indices de pression détectés</CardTitle>
            <CardDescription>Fréquence des indices observés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {indicesPression.map((ind, idx) => {
                const max = indicesPression[0]?.value || 1;
                const pct = Math.round((ind.value / max) * 100);
                return (
                  <div key={ind.name} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium capitalize">{ind.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {ind.value}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Indices dominants par type (table) */}
      {indicesDominants.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Indice dominant par type de pression</CardTitle>
            <CardDescription>
              Indice de terrain le plus souvent relevé pour chaque type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {indicesDominants.map((r, idx) => (
                <div
                  key={r.type_pression}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
                      }}
                    />
                    <span className="text-sm font-medium capitalize truncate">
                      {r.type_pression}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="capitalize">
                      {r.indice}
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {r.value}×
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matrice détail : empilement des indices par type de pression */}
      {detailStacked.length > 0 && allIndices.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Détail des indices par type de pression
            </CardTitle>
            <CardDescription>
              Chaque barre détaille les indices de terrain ayant déclenché ce type
              ({allIndices.length} indices distincts)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={detailStacked}
                layout="vertical"
                margin={{ left: 16, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  dataKey="type_pression"
                  type="category"
                  width={140}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconSize={8}
                  formatter={(v) => <span className="capitalize">{v}</span>}
                />
                {allIndices.map((ind, idx) => (
                  <Bar
                    key={ind}
                    dataKey={ind}
                    name={ind}
                    stackId="ind"
                    fill={MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Focus drill-down : sélection d'un type de pression */}
      {typesDisponibles.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Focus sur un type de pression
                </CardTitle>
                <CardDescription>
                  Drill-down par type : indices, gravité, ancienneté, forêts
                </CardDescription>
              </div>
              <Select
                value={selectedTypeMenace}
                onValueChange={setSelectedTypeMenace}
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Choisir un type" />
                </SelectTrigger>
                <SelectContent>
                  {typesDisponibles.map((tp) => (
                    <SelectItem key={tp} value={tp} className="capitalize">
                      {tp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {/* KPIs du type sélectionné */}
            {focusPriorite && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <KpiTile
                  label="Observations"
                  value={focusPriorite.nombre_observations}
                />
                <KpiTile
                  label="Indices relevés"
                  value={focusPriorite.nombre_indices}
                />
                <KpiTile
                  label="Gravité moy."
                  value={focusPriorite.score_moyen_gravite}
                  suffix="/4"
                />
                <KpiTile
                  label="Ancienneté moy."
                  value={focusPriorite.score_moyen_anciennete}
                  suffix="/3"
                />
                <KpiTile
                  label="Score priorité"
                  value={focusPriorite.score}
                  suffix="/100"
                  accent={
                    focusPriorite.score >= 75
                      ? "#b91c1c"
                      : focusPriorite.score >= 50
                        ? "#d97706"
                        : "#15803d"
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Donut indices */}
              {focusIndices.length > 0 ? (
                <div className="h-64">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Répartition des indices
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={focusIndices}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={75}
                        paddingAngle={2}
                        label={(d: { name?: string; share?: number }) =>
                          d.share && d.share >= 8 ? `${d.share}%` : ""
                        }
                        labelLine={false}
                      >
                        {focusIndices.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={tooltipItemStyle}
                        labelStyle={tooltipLabelStyle}
                        formatter={(value: number, name: string) => [
                          `${value}`,
                          name,
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 10 }}
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
                  Aucun indice
                </div>
              )}

              {/* Mini-bars : gravité + ancienneté */}
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Niveaux de gravité
                  </div>
                  {focusGravite.length > 0 ? (
                    <div className="space-y-1.5">
                      {focusGravite.map((g) => {
                        const total = focusGravite.reduce(
                          (s, x) => s + x.value,
                          0,
                        ) || 1;
                        const pct = Math.round((g.value / total) * 100);
                        return (
                          <div key={g.key} className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span>{g.name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {g.value} · {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: g.fill }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">N/A</div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Ancienneté
                  </div>
                  {focusAnciennete.length > 0 ? (
                    <div className="space-y-1.5">
                      {focusAnciennete.map((a) => {
                        const total = focusAnciennete.reduce(
                          (s, x) => s + x.value,
                          0,
                        ) || 1;
                        const pct = Math.round((a.value / total) * 100);
                        return (
                          <div key={a.key} className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span>{a.name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {a.value} · {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: a.fill }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">N/A</div>
                  )}
                </div>
              </div>

              {/* Forêts concernées */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Forêts concernées
                </div>
                {focusForests.length > 0 ? (
                  <div className="space-y-1.5 max-h-64 overflow-auto pr-1">
                    {focusForests.map((f, idx) => {
                      const max = focusForests[0]?.value || 1;
                      const pct = Math.round((f.value / max) * 100);
                      return (
                        <div key={f.forest} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="truncate pr-2">{f.forest}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {f.value}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor:
                                  MENACES_TYPE_PALETTE[
                                    idx % MENACES_TYPE_PALETTE.length
                                  ],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Aucune forêt concernée
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pression synthétique par forêt */}
      {pressionForest.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Indice de pression par forêt</CardTitle>
            <CardDescription>
              Score combiné (indices × gravité × ancienneté)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pressionForest} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="forest" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {pressionForest.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Priorité d'intervention (table) */}
      {prioriteType.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Priorité d'intervention par type de pression</CardTitle>
            <CardDescription>
              Score composite : 40% gravité + 30% ancienneté + 30% intensité (0–100)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Type de pression</th>
                    <th className="py-2 px-2 text-right">Score</th>
                    <th className="py-2 px-2 text-right">Observations</th>
                    <th className="py-2 px-2 text-right">Indices</th>
                    <th className="py-2 px-2 text-right">Gravité moy.</th>
                    <th className="py-2 px-2 text-right">Ancienneté moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {prioriteType.map((p, idx) => (
                    <tr key={p.type_pression} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium capitalize">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                MENACES_TYPE_PALETTE[idx % MENACES_TYPE_PALETTE.length],
                            }}
                          />
                          {p.type_pression}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Badge
                          variant="secondary"
                          className="tabular-nums"
                          style={{
                            backgroundColor:
                              p.score >= 75
                                ? "#fee2e2"
                                : p.score >= 50
                                  ? "#fef3c7"
                                  : "#dcfce7",
                            color:
                              p.score >= 75
                                ? "#991b1b"
                                : p.score >= 50
                                  ? "#92400e"
                                  : "#166534",
                          }}
                        >
                          {p.score.toFixed(1)}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.nombre_observations}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.nombre_indices}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.score_moyen_gravite.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.score_moyen_anciennete.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Similarité Jaccard entre forêts */}
      {jaccard.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Similarité entre forêts (Jaccard)</CardTitle>
            <CardDescription>
              Sur les types de pressions communs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2">Paire</th>
                  <th className="py-2 px-2 text-right">A</th>
                  <th className="py-2 px-2 text-right">B</th>
                  <th className="py-2 px-2 text-right">Communs</th>
                  <th className="py-2 px-2 text-right">Indice</th>
                </tr>
              </thead>
              <tbody>
                {jaccard.map((p, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {p.forest_a} ↔ {p.forest_b}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.types_a}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.types_b}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.common}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <Badge variant="secondary">{p.jaccard.toFixed(2)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className="text-xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {typeof value === "number" && !Number.isInteger(value) ? value.toFixed(1) : value}
        {suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </span>
    </div>
  );
}

// Onglet d'une catégorie d'indicateur : filtre par forêt + graphique
// de synthèse + cartes d'indicateurs (filtrés ou non).
function CategoryTabContent({
  formKey,
  globalForm,
  byForestForm,
  selectedForest,
  onForestChange,
}: {
  formKey: string;
  globalForm: import("@/lib/api").FormIndicators | undefined;
  byForestForm: FormIndicatorsByForest | undefined;
  selectedForest: string;
  onForestChange: (value: string) => void;
}) {
  const meta = FORM_META[formKey];
  const formColor = meta?.color ?? "#6b7280";
  const availableForests = byForestForm
    ? Object.keys(byForestForm.by_forest)
    : [];

  // Données affichées selon le filtre
  const displayed: import("@/lib/api").FormIndicators | undefined =
    selectedForest === "all"
      ? globalForm
      : byForestForm && byForestForm.by_forest[selectedForest]
      ? {
          form_key: formKey,
          form_name: byForestForm.form_name,
          total_submissions:
            byForestForm.submissions_by_forest[selectedForest] ?? 0,
          indicators: byForestForm.by_forest[selectedForest],
        }
      : undefined;

  // Graphique de synthèse : valeurs des indicateurs (filtrés)
  const synthData = (displayed?.indicators ?? [])
    .filter((i) => typeof i.value === "number")
    .map((i) => ({
      name: i.indicator_name,
      value: typeof i.value === "number" ? i.value : 0,
      fill: INDICATOR_META[i.indicator_name]?.color ?? formColor,
    }));

  if (!globalForm) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aucune donnée disponible pour ce suivi.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vue détaillée multi-graphiques pour le suivi de la faune */}
      {formKey === "monitoring_faune" && displayed && (
        <FauneChartsBreakdown
          indicators={displayed.indicators}
          forestLabel={selectedForest === "all" ? null : selectedForest}
        />
      )}

      {/* Vue détaillée multi-graphiques pour le suivi du reboisement */}
      {formKey === "monitoring_reboisement" && displayed && (
        <ReboisementChartsBreakdown
          indicators={displayed.indicators}
          forestLabel={selectedForest === "all" ? null : selectedForest}
        />
      )}

      {/* Vue détaillée multi-graphiques pour le suivi des menaces */}
      {formKey === "menaces" && displayed && (
        <MenacesChartsBreakdown
          forestLabel={selectedForest === "all" ? null : selectedForest}
        />
      )}

      {/* Vue détaillée multi-graphiques pour le suivi des plantations */}
      {formKey === "planting_arbre" && displayed && (
        <PlantingChartsBreakdown
          indicators={displayed.indicators}
          forestLabel={selectedForest === "all" ? null : selectedForest}
        />
      )}

      {/* Graphique de synthèse (autres formulaires) */}
      {formKey !== "monitoring_faune" && formKey !== "monitoring_reboisement" && formKey !== "menaces" && formKey !== "planting_arbre" && synthData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Synthèse des indicateurs
              {selectedForest !== "all" && ` — ${selectedForest}`}
            </CardTitle>
            <CardDescription>
              Vue d'ensemble des indicateurs métier
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={synthData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  angle={-25}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  stroke="var(--color-border)"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  stroke="var(--color-border)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--color-card-foreground)",
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {synthData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cartes d'indicateurs */}
      {displayed && <FormIndicatorsSection formData={displayed} />}
    </div>
  );
}

// ─── Composant tableau des missions par équipe ───────────────

const ACTIVITE_COLOR: Record<string, string> = {
  monitoring_faune: "#22d3ee",
  monitoring_reboisement: "#16a34a",
  planting_arbre: "#84cc16",
  menaces: "#f59e0b",
};

const SITE_COLORS: Record<string, string> = {
  "Zaranou":        "#16a34a",
  "Apouéba":        "#0ea5e9",
  "Non spécifiée":  "#6b7280",
};

/** Formate un nom Kobo snake_case en MAJUSCULES avec espaces : "kouame_aka_kouadio" → "KOUAME AKA KOUADIO" */
function formatNom(raw: string): string {
  return raw.trim().replace(/_/g, " ").toUpperCase();
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function TeamMissionsTable({ data }: { data: TeamMissionsResponse | null }) {
  const [search, setSearch] = useState("");
  const [filterActivite, setFilterActivite] = useState("all");
  const [filterForet, setFilterForet] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aucune donnée de mission disponible.
        </CardContent>
      </Card>
    );
  }

  const activites = Array.from(new Set(data.missions.map((m) => m.activite)));
  const KNOWN_FORETS = ["Apouéba", "Zaranou"];
  const forets = KNOWN_FORETS.filter((f) =>
    data.missions.some((m) => m.foret === f)
  );

  const filtered = data.missions.filter((m) => {
    if (filterActivite !== "all" && m.activite !== filterActivite) return false;
    if (filterForet !== "all" && m.foret !== filterForet) return false;
    if (search) {
      const q = search.toLowerCase();
      const inMembres = m.membres.some((mb) => mb.toLowerCase().includes(q));
      const inChef = m.chef_equipe?.toLowerCase().includes(q) ?? false;
      const inDate = (m.date_mission ?? "").includes(q);
      const inActivite = m.activite_label.toLowerCase().includes(q);
      if (!inMembres && !inChef && !inDate && !inActivite) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const from = safePage * pageSize;
  const paginated = filtered.slice(from, from + pageSize);

  const handleSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleActivite = (v: string) => { setFilterActivite(v); setPage(0); };
  const handleForet = (v: string) => { setFilterForet(v); setPage(0); };
  const handlePageSize = (v: string) => { setPageSize(Number(v)); setPage(0); };

  const firstItem = filtered.length === 0 ? 0 : from + 1;
  const lastItem = Math.min(from + pageSize, filtered.length);

  // ── Stats membres pour le diagramme (sur les missions filtrées) ──
  const membreStats: Record<string, { missions: number; chef: number }> = {};
  for (const m of filtered) {
    for (const mb of m.membres) {
      if (!membreStats[mb]) membreStats[mb] = { missions: 0, chef: 0 };
      membreStats[mb].missions += 1;
    }
    if (m.chef_equipe) {
      if (!membreStats[m.chef_equipe]) membreStats[m.chef_equipe] = { missions: 0, chef: 0 };
      membreStats[m.chef_equipe].chef += 1;
    }
  }
  const chartData = Object.entries(membreStats)
    .map(([name, s]) => ({ name: formatNom(name), missions: s.missions, chef: s.chef }))
    .sort((a, b) => b.missions - a.missions);

  // ── Stats globales ────────────────────────────────────────────────
  const allEcogardes = new Set<string>();
  for (const m of filtered) {
    m.membres.forEach((mb) => { if (mb) allEcogardes.add(mb); });
    if (m.chef_equipe) allEcogardes.add(m.chef_equipe);
  }
  const uniqueEcogardes = allEcogardes.size;
  const distinctDays = new Set(filtered.map((m) => m.date_mission).filter(Boolean)).size;
  const totalParticipations = filtered.reduce((sum, m) => {
    const team = new Set(m.membres.filter(Boolean));
    if (m.chef_equipe) team.add(m.chef_equipe);
    return sum + team.size;
  }, 0);
  const avgPerEcogarde =
    uniqueEcogardes > 0 ? (totalParticipations / uniqueEcogardes).toFixed(1) : "—";

  // ── Par site ─────────────────────────────────────────────────────
  const missionsBySite: Record<string, number> = {};
  for (const m of filtered) {
    const site = m.foret && m.foret !== "Non spécifiée" ? m.foret : "Non spécifiée";
    missionsBySite[site] = (missionsBySite[site] ?? 0) + 1;
  }
  const siteChartData = Object.entries(missionsBySite)
    .map(([site, missions]) => ({ site, missions }))
    .sort((a, b) => b.missions - a.missions);

  // ── Par activité ─────────────────────────────────────────────────
  const missionsByActivite: Record<string, { label: string; count: number; color: string }> = {};
  for (const m of filtered) {
    if (!missionsByActivite[m.activite]) {
      missionsByActivite[m.activite] = {
        label: m.activite_label,
        count: 0,
        color: ACTIVITE_COLOR[m.activite] ?? "#6b7280",
      };
    }
    missionsByActivite[m.activite].count += 1;
  }
  const activiteChartData = Object.values(missionsByActivite)
    .map(({ label, count, color }) => ({ activite: label, missions: count, color }))
    .sort((a, b) => b.missions - a.missions);

  return (
    <div className="space-y-4">
      {/* Diagramme en barres groupées */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Participation par membre
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 60 }}
              barCategoryGap="30%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--color-foreground)" }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-foreground)" }}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  color: "var(--color-popover-foreground)",
                }}
                formatter={(value: number, key: string) =>
                  [value, key === "missions" ? "Missions" : "Chef d'équipe"]
                }
              />
              <Bar dataKey="missions" name="missions" fill="#22d3ee" radius={[3, 3, 0, 0]} />
              <Bar dataKey="chef" name="chef" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Cartes KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground leading-tight">Missions terrain</span>
              <ClipboardList className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground leading-tight">Écogardes mobilisés</span>
              <Users className="h-3.5 w-3.5 text-primary shrink-0" />
            </div>
            <div className="text-2xl font-bold">{uniqueEcogardes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground leading-tight">Jours d'intervention</span>
              <CalendarDays className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold">{distinctDays}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground leading-tight">Moy. missions / écogarde</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold">{avgPerEcogarde}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Graphiques par site et par activité ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Par site */}
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Missions par site
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {siteChartData.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">
                Aucune donnée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={siteChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="site"
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                    width={88}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                    formatter={(v: number) => [v, "Missions"]}
                  />
                  <Bar dataKey="missions" radius={[0, 3, 3, 0]}>
                    {siteChartData.map((entry, i) => (
                      <Cell key={i} fill={SITE_COLORS[entry.site] ?? "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Par activité */}
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Missions par type d'activité
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {activiteChartData.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">
                Aucune donnée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={activiteChartData}
                  margin={{ top: 0, right: 8, left: 0, bottom: 36 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="activite"
                    tick={{ fontSize: 9, fill: "hsl(var(--foreground))" }}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                    formatter={(v: number) => [v, "Missions"]}
                  />
                  <Bar dataKey="missions" radius={[3, 3, 0, 0]}>
                    {activiteChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Rechercher membre, chef, date…"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
        />
        <Select value={filterActivite} onValueChange={handleActivite}>
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue placeholder="Toutes activités" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes activités</SelectItem>
            {activites.map((a) => {
              const entry = data.missions.find((m) => m.activite === a);
              return (
                <SelectItem key={a} value={a}>
                  {entry?.activite_label ?? a}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={filterForet} onValueChange={handleForet}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="Toutes forêts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes forêts</SelectItem>
            {forets.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Date de mission
                  </th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Activité
                  </th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Forêt
                  </th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                    Membres équipe
                  </th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Chef d'équipe
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((m, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground">
                      {m.date_mission ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border"
                        style={{
                          borderColor: `${ACTIVITE_COLOR[m.activite] ?? "#6b7280"}50`,
                          color: ACTIVITE_COLOR[m.activite] ?? "#6b7280",
                          backgroundColor: `${ACTIVITE_COLOR[m.activite] ?? "#6b7280"}12`,
                        }}
                      >
                        {m.activite_label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-sm">
                      {m.foret}
                    </td>
                    <td className="py-2.5 px-4">
                      {m.membres.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.membres.map((mb, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                            >
                              <Users className="h-2.5 w-2.5" />
                              {formatNom(mb)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {m.chef_equipe ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          <ClipboardList className="h-3 w-3 text-amber-500" />
                          {formatNom(m.chef_equipe)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Aucune mission ne correspond aux filtres sélectionnés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Barre de pagination intégrée au bas du tableau */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t text-xs text-muted-foreground">
            <span>
              Lignes {firstItem}–{lastItem} sur {filtered.length}
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span>Lignes par page</span>
                <Select value={String(pageSize)} onValueChange={handlePageSize}>
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span>
                Page {safePage + 1} / {totalPages}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={safePage === 0}
                  onClick={() => setPage(0)}
                  title="Première page"
                >
                  <ChevronDown className="h-3.5 w-3.5 rotate-90 -scale-x-100" />
                  <ChevronDown className="h-3.5 w-3.5 rotate-90 -scale-x-100 -ml-2.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  title="Page précédente"
                >
                  <ChevronUp className="h-3.5 w-3.5 -rotate-90" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  title="Page suivante"
                >
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage(totalPages - 1)}
                  title="Dernière page"
                >
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 -ml-2.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Composant EcogardesTab ─────────────────────────────────────────────────

const FORET_OPTIONS = ["Zaranou", "Apouéba"];

const EMPTY_ENRICH: EcogardeEnrich = {
  telephone: null,
  email: null,
  genre: null,
  is_active: true,
};

function EcogardeCard({
  eco,
  isAdmin,
  onEdit,
  onDelete,
}: {
  eco: EcogardeProfile;
  isAdmin: boolean;
  onEdit: (eco: EcogardeProfile) => void;
  onDelete: (eco: EcogardeProfile) => void;
}) {
  const initials = `${eco.prenom[0] ?? ""}${eco.nom[0] ?? ""}`.toUpperCase();
  return (
    <Card className={`transition-shadow hover:shadow-md ${!eco.is_active ? "opacity-60" : ""}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        {/* En-tête : avatar + identité + actions */}
        <div className="flex items-start gap-3">
          {/* Avatar : photo ou initiales */}
          <div className="h-12 w-12 rounded-full shrink-0 overflow-hidden bg-primary/15 flex items-center justify-center text-sm font-bold text-primary select-none border border-border">
            {eco.photo_url ? (
              <img
                src={eco.photo_url}
                alt={`${eco.prenom} ${eco.nom}`}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm leading-snug">
              {eco.prenom} <span className="uppercase">{eco.nom}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <Badge variant="outline" className="text-[10px] font-mono px-1.5">
                {eco.code_kobo}
              </Badge>
              {eco.foret && (
                <Badge className="text-[10px] bg-emerald-600/90 text-white hover:bg-emerald-600/90">
                  {eco.foret}
                </Badge>
              )}
              {eco.genre && (
                <Badge variant="outline" className={`text-[10px] ${eco.genre === "Femme" ? "border-pink-400 text-pink-600" : "border-blue-400 text-blue-600"}`}>
                  {eco.genre}
                </Badge>
              )}
              {!eco.is_active && (
                <Badge variant="destructive" className="text-[10px]">
                  Inactif
                </Badge>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-0.5 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(eco)}
                title="Modifier"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(eco)}
                title="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Stats Kobo */}
        <div className="grid grid-cols-3 gap-1 text-center border rounded-lg p-2 bg-muted/30">
          <div>
            <div className="text-base font-bold text-primary">{eco.total_missions}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Missions</div>
          </div>
          <div className="border-x">
            <div className="text-base font-bold">{eco.total_submissions}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Observations</div>
          </div>
          <div>
            <div className="text-base font-bold">{eco.forms_covered}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Activités</div>
          </div>
        </div>

        {/* Répartition par formulaire */}
        {Object.keys(eco.by_form).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(eco.by_form).map(([key, count]) => (
              <span
                key={key}
                className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  borderColor: `${FORM_META[key]?.color ?? "#6b7280"}50`,
                  color: FORM_META[key]?.color ?? "#6b7280",
                  backgroundColor: `${FORM_META[key]?.color ?? "#6b7280"}10`,
                }}
              >
                {FORM_META[key]?.label ?? key} : {count}
              </span>
            ))}
          </div>
        )}

        {/* Informations complémentaires */}
        <div className="space-y-1">
          {eco.derniere_mission && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              Dernière mission : <span className="font-medium">{eco.derniere_mission}</span>
            </div>
          )}
          {!eco.derniere_mission && eco.total_submissions === 0 && (
            <div className="text-[11px] text-muted-foreground italic">
              Aucune donnée Kobo correspondante
            </div>
          )}
          {eco.telephone && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              {eco.telephone}
            </div>
          )}
          {eco.email && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              {eco.email}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EcogardesTab({
  isAdmin,
  initialProfiles,
}: {
  isAdmin: boolean;
  initialProfiles: EcogardesListResponse | null;
}) {
  const [profiles, setProfiles] = useState<EcogardeProfile[]>(
    initialProfiles?.ecogardes ?? []
  );
  const [loading, setLoading] = useState(!initialProfiles);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<EcogardeProfile | null>(null);
  const [enrich, setEnrich] = useState<EcogardeEnrich>(EMPTY_ENRICH);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterForet, setFilterForet] = useState("all");
  const [filterActif, setFilterActif] = useState("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listEcogardes();
      setProfiles(res.ecogardes);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialProfiles) refresh();
  }, []);

  const openEdit = (eco: EcogardeProfile) => {
    setEditTarget(eco);
    setEnrich({ telephone: eco.telephone, email: eco.email, genre: eco.genre, is_active: eco.is_active });
    setPhotoFile(null);
    setPhotoPreview(eco.photo_url);
    setError(null);
    setInfo(null);
    setShowModal(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleDelete = async (eco: EcogardeProfile) => {
    if (!confirm(`Supprimer définitivement le profil de ${eco.prenom} ${eco.nom} ?`)) return;
    setError(null);
    try {
      await deleteEcogarde(eco.id);
      setInfo(`Profil supprimé : ${eco.prenom} ${eco.nom}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSubmitting(true);
    setError(null);
    try {
      if (photoFile) {
        await uploadEcogardePhoto(editTarget.id, photoFile);
      }
      await updateEcogarde(editTarget.id, enrich);
      setInfo(`Profil mis à jour : ${editTarget.prenom} ${editTarget.nom}`);
      setShowModal(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = profiles.filter((p) => {
    if (filterForet !== "all" && p.foret !== filterForet) return false;
    if (filterActif === "actif" && !p.is_active) return false;
    if (filterActif === "inactif" && p.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.nom.toLowerCase().includes(q) &&
        !p.prenom.toLowerCase().includes(q) &&
        !p.code_kobo.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const totalMissions = filtered.reduce((s, p) => s + p.total_missions, 0);
  const totalObs = filtered.reduce((s, p) => s + p.total_submissions, 0);

  const initials = editTarget
    ? `${editTarget.prenom[0] ?? ""}${editTarget.nom[0] ?? ""}`.toUpperCase()
    : "";

  return (
    <div className="space-y-4">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44"
            />
          </div>
          <Select value={filterForet} onValueChange={setFilterForet}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="Toutes forêts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes forêts</SelectItem>
              {FORET_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterActif} onValueChange={setFilterActif}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="actif">Actifs</SelectItem>
              <SelectItem value="inactif">Inactifs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {info && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400 flex justify-between">
          {info}
          <button onClick={() => setInfo(null)} className="ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Résumé */}
      {!loading && profiles.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="text-2xl font-bold">{filtered.length}</div>
              <div className="text-xs text-muted-foreground">Écogardes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="text-2xl font-bold text-primary">{totalMissions}</div>
              <div className="text-xs text-muted-foreground">Missions cumulées</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="text-2xl font-bold">{totalObs}</div>
              <div className="text-xs text-muted-foreground">Observations</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Contenu principal */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des profils…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {profiles.length === 0
              ? "Aucun écogarde détecté. Les profils apparaissent automatiquement dès qu'un agent soumet des données dans KoboToolbox."
              : "Aucun profil ne correspond aux filtres sélectionnés."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((eco) => (
            <EcogardeCard
              key={eco.id}
              eco={eco}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal d'enrichissement (photo + contact) */}
      {showModal && editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">
                {editTarget.prenom} <span className="uppercase">{editTarget.nom}</span>
              </h2>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setShowModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

              {/* Photo de profil */}
              <div className="flex flex-col items-center gap-3">
                <div className="h-20 w-20 rounded-full overflow-hidden bg-primary/15 flex items-center justify-center text-xl font-bold text-primary border border-border">
                  {photoPreview ? (
                    <img src={photoPreview} alt="aperçu" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                    <Camera className="h-3.5 w-3.5" />
                    {photoPreview ? "Changer la photo" : "Ajouter une photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
                <p className="text-[10px] text-muted-foreground">jpeg / png / webp · max 5 Mo</p>
              </div>

              <Separator />

              {/* Téléphone */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={enrich.telephone ?? ""}
                  onChange={(e) =>
                    setEnrich((f) => ({ ...f, telephone: e.target.value || null }))
                  }
                  placeholder="+225 07 00 00 00 00"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email
                </label>
                <input
                  type="email"
                  value={enrich.email ?? ""}
                  onChange={(e) =>
                    setEnrich((f) => ({ ...f, email: e.target.value || null }))
                  }
                  placeholder="agent@example.com"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Genre */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Genre</label>
                <Select
                  value={enrich.genre ?? "none"}
                  onValueChange={(v) =>
                    setEnrich((f) => ({ ...f, genre: v === "none" ? null : v }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Non renseigné" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Non renseigné</SelectItem>
                    <SelectItem value="Homme">Homme</SelectItem>
                    <SelectItem value="Femme">Femme</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Statut */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enrich.is_active ?? true}
                  onChange={(e) =>
                    setEnrich((f) => ({ ...f, is_active: e.target.checked }))
                  }
                  className="h-4 w-4"
                />
                Écogarde actif
              </label>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Annuler
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enregistrement…</>
                  ) : "Enregistrer"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KpiPage() {
  const { user } = useAuth();
  const isViewer = user?.role === ROLES.VIEWER;
  const isSuperadminUser = user?.role === ROLES.SUPERADMIN;
  const isAdminUser = isAdmin(user);
  const koboBaseUrl = (import.meta.env.VITE_KOBO_URL as string | undefined) ?? "https://kf.kobotoolbox.org";
  const [configuredForms, setConfiguredForms] = useState<KoboFormConfigured[]>([]);
  const [globalIndicators, setGlobalIndicators] = useState<GlobalIndicators | null>(null);
  const [ecogardesProfiles, setEcogardesProfiles] = useState<EcogardesListResponse | null>(null);
  const [teams, setTeams] = useState<TeamsResponse | null>(null);
  const [teamMissions, setTeamMissions] = useState<TeamMissionsResponse | null>(null);
  const [byForest, setByForest] = useState<IndicatorsByForestResponse | null>(null);
  const [globalForest, setGlobalForest] = useState<string>("all");
  // Filtres internes à l'onglet "Vue globale"
  const [globalFormFilter, setGlobalFormFilter] = useState<string>("all");
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [globalSort, setGlobalSort] = useState<"none" | "value_desc" | "value_asc" | "name_asc">("none");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [formKpis, setFormKpis] = useState<Record<string, FormKpiDashboard>>({});
  const [kpiLoading, setKpiLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineMode, setTimelineMode] = useState<"monthly" | "cumulative">("monthly");
  const [globalMonth, setGlobalMonth] = useState<string>("all");

  const loadAll = async () => {
    const [forms, indicators, ecgProfiles, tm, bf, tl, tmissions] = await Promise.all([
      getConfiguredKoboForms(),
      getGlobalIndicators(),
      listEcogardes().catch(() => null),
      getTeamsStats().catch(() => null),
      getIndicatorsByForest().catch(() => null),
      getTimeline().catch(() => [] as TimelineEntry[]),
      getTeamMissions().catch(() => null),
    ]);
    setConfiguredForms(forms);
    setGlobalIndicators(indicators);
    setEcogardesProfiles(ecgProfiles);
    setTeams(tm);
    setByForest(bf);
    setTimeline(tl);
    setTeamMissions(tmissions);
  };

  useEffect(() => {
    loadAll()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await loadAll();
      // Recharger aussi les KPI déjà ouverts
      const openKeys = Object.keys(formKpis);
      if (openKeys.length > 0) {
        const fresh = await Promise.all(openKeys.map((k) => getFormKpiDashboard(k)));
        setFormKpis(Object.fromEntries(openKeys.map((k, i) => [k, fresh[i]])));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du rafraîchissement");
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleKpi = async (key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (formKpis[key]) return;
    setKpiLoading(key);
    try {
      const kpi = await getFormKpiDashboard(key);
      setFormKpis((prev) => ({ ...prev, [key]: kpi }));
    } catch {
      // ignore - affiche "Aucune donnée" via état vide
    } finally {
      setKpiLoading(null);
    }
  };

  // Liste de toutes les forêts disponibles (union des clés de by_forest)
  const allForests = useMemo(() => {
    const set = new Set<string>();
    byForest?.forms.forEach((f) =>
      Object.keys(f.by_forest).forEach((k) => set.add(k)),
    );
    return Array.from(set).sort();
  }, [byForest]);

  // Vue globale filtrée selon la forêt sélectionnée
  const filteredGlobal = useMemo<GlobalIndicators | null>(() => {
    if (!globalIndicators) return null;
    if (globalForest === "all" || !byForest) return globalIndicators;
    const forms = globalIndicators.forms.map((f) => {
      const bf = byForest.forms.find((x) => x.form_key === f.form_key);
      if (!bf || !bf.by_forest[globalForest]) {
        return { ...f, total_submissions: 0, indicators: [] };
      }
      return {
        ...f,
        total_submissions: bf.submissions_by_forest[globalForest] ?? 0,
        indicators: bf.by_forest[globalForest],
      };
    });
    return {
      total_submissions: forms.reduce((a, x) => a + x.total_submissions, 0),
      forms,
    };
  }, [globalIndicators, byForest, globalForest]);

  // Vue globale : filtres internes supplémentaires (formulaire, recherche, tri)
  const displayGlobal = useMemo<GlobalIndicators | null>(() => {
    if (!filteredGlobal) return null;
    const q = globalSearch.trim().toLowerCase();
    let forms = filteredGlobal.forms;
    if (globalFormFilter !== "all") {
      forms = forms.filter((f) => f.form_key === globalFormFilter);
    }
    forms = forms.map((f) => {
      let indicators = f.indicators;
      if (q) {
        indicators = indicators.filter((ind) =>
          ind.indicator_name.toLowerCase().includes(q),
        );
      }
      if (globalSort !== "none") {
        const arr = [...indicators];
        arr.sort((a, b) => {
          if (globalSort === "name_asc") {
            return a.indicator_name.localeCompare(b.indicator_name, "fr");
          }
          const av = typeof a.value === "number" ? a.value : Number.NEGATIVE_INFINITY;
          const bv = typeof b.value === "number" ? b.value : Number.NEGATIVE_INFINITY;
          return globalSort === "value_desc" ? bv - av : av - bv;
        });
        indicators = arr;
      }
      return { ...f, indicators };
    });
    return {
      total_submissions: filteredGlobal.total_submissions,
      forms,
    };
  }, [filteredGlobal, globalFormFilter, globalSearch, globalSort]);

  const globalFiltersActive =
    globalFormFilter !== "all" || globalSearch.trim() !== "" || globalSort !== "none";
  const resetGlobalFilters = () => {
    setGlobalFormFilter("all");
    setGlobalSearch("");
    setGlobalSort("none");
  };
  const globalTotalIndicators = displayGlobal
    ? displayGlobal.forms.reduce((acc, f) => acc + f.indicators.length, 0)
    : 0;

  // Mois disponibles (depuis la timeline)
  const availableMonths = useMemo(() => {
    return timeline.map((e) => String(e.month)).sort();
  }, [timeline]);

  // Timeline filtrée selon le mois sélectionné
  const filteredTimeline = useMemo(() => {
    if (globalMonth === "all") return timeline;
    return timeline.filter((e) => String(e.month) === globalMonth);
  }, [timeline, globalMonth]);

  // Totaux par activité sur la période filtrée (pour le donut inline)
  const filteredPieData = useMemo(() => {
    return configuredForms.map((f, i) => ({
      name: FORM_META[f.key]?.label ?? f.name.slice(0, 20),
      value: filteredTimeline.reduce((sum, e) => sum + Number(e[f.key] ?? 0), 0),
      fill: COLORS[i % COLORS.length],
    }));
  }, [filteredTimeline, configuredForms]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement des indicateurs…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">{error}</div>
      </div>
    );
  }

  // Source de vérité pour les compteurs : globalIndicators (recompté à partir
  // des observations réelles), avec fallback sur submission_count si indispo.
  const realCounts: Record<string, number> = Object.fromEntries(
    (filteredGlobal?.forms ?? []).map((f) => [f.form_key, f.total_submissions])
  );
  const countFor = (f: KoboFormConfigured) =>
    realCounts[f.key] ?? f.submission_count ?? 0;

  const totalSubmissions =
    filteredGlobal?.total_submissions ??
    configuredForms.reduce((sum, f) => sum + (f.submission_count ?? 0), 0);
  const avg =
    configuredForms.length > 0 ? Math.round(totalSubmissions / configuredForms.length) : 0;

  const barData = configuredForms.map((f, i) => ({
    name: FORM_META[f.key]?.label ?? f.name.slice(0, 25),
    submissions: countFor(f),
    fill: COLORS[i % COLORS.length],
  }));

  const pieData = configuredForms.map((f, i) => ({
    name: FORM_META[f.key]?.label ?? f.name.slice(0, 20),
    value: countFor(f),
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suivi des indicateurs</h1>
          <p className="text-sm text-muted-foreground">
            Indicateur de suivi des forêts
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Actualisation…" : "Actualiser"}
        </Button>
      </div>

      <Separator />

      {/* Filtre global par forêt (s'applique à toutes les vues filtrables) */}
      {allForests.length > 0 && (
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Trees className="h-4 w-4 text-muted-foreground" />
              Forêt :
            </div>
            <div className="min-w-[220px]">
              <Select value={globalForest} onValueChange={setGlobalForest}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Toutes les forêts
                  </SelectItem>
                  {allForests.filter((f) => ["Apouéba", "Zaranou"].includes(f)).map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {globalForest !== "all" && (
              <Badge variant="outline" className="ml-auto">
                {totalSubmissions} observations
              </Badge>
            )}
            {availableMonths.length > 0 && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Période :
                </div>
                <div className="min-w-[160px]">
                  <Select value={globalMonth} onValueChange={setGlobalMonth}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les périodes</SelectItem>
                      {availableMonths.map((m) => {
                        const [year, month] = m.split("-");
                        const labels = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
                        const label = `${labels[parseInt(month, 10) - 1]} ${year}`;
                        return <SelectItem key={m} value={m}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className={`grid grid-cols-1 gap-4 ${isViewer ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Activités</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{configuredForms.length}</div>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="secondary" className="text-[10px] h-5 gap-0.5">
                <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                Niveaux de monitorring
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Observations</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Database className="h-4 w-4 text-cyan-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSubmissions}</div>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="secondary" className="text-[10px] h-5 gap-0.5">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                collectées
              </Badge>
            </div>
          </CardContent>
        </Card>

        {!isViewer && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Moyenne</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avg}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground">observations / activité</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Évolution temporelle + Répartition ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

        {/* Ligne d'évolution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Évolution des observations par activité</CardTitle>
                <CardDescription>Progression mensuelle des suivis terrain</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={timelineMode === "monthly" ? "default" : "outline"}
                  onClick={() => setTimelineMode("monthly")}
                >
                  Mensuel
                </Button>
                <Button
                  size="sm"
                  variant={timelineMode === "cumulative" ? "default" : "outline"}
                  onClick={() => setTimelineMode("cumulative")}
                >
                  Cumulatif
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-80">
            {timeline.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucune donnée de chronologie disponible.
              </div>
            ) : filteredTimeline.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucune donnée pour cette période.
              </div>
            ) : (() => {
              const cumulMap: Record<string, number> = {};
              configuredForms.forEach((f) => { cumulMap[f.key] = 0; });
              const chartData = filteredTimeline.map((entry) => {
                const point: Record<string, string | number> = { month: String(entry.month) };
                configuredForms.forEach((f) => {
                  const monthly = Number(entry[f.key] ?? 0);
                  if (timelineMode === "cumulative") {
                    cumulMap[f.key] += monthly;
                    point[f.key] = cumulMap[f.key];
                  } else {
                    point[f.key] = monthly;
                  }
                });
                return point;
              });
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ bottom: 20, right: 24, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                      stroke="var(--color-border)"
                      angle={-20}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      stroke="var(--color-border)"
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "var(--color-card-foreground)",
                      }}
                      formatter={(value: number, key: string) => [value, FORM_META[key]?.label ?? key]}
                    />
                    <Legend
                      formatter={(key: string) => FORM_META[key]?.label ?? key}
                      wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                    />
                    {configuredForms.map((f) => {
                      const color = FORM_META[f.key]?.color ?? COLORS[0];
                      return (
                        <Line
                          key={f.key}
                          type="monotone"
                          dataKey={f.key}
                          stroke={color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: color }}
                          activeDot={{ r: 5 }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        {/* Diagramme circulaire — répartition totale */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Répartition totale</CardTitle>
            <CardDescription>
              {globalMonth === "all"
                ? "Observations par activité"
                : (() => {
                    const [year, month] = globalMonth.split("-");
                    const labels = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
                    return `${labels[parseInt(month, 10) - 1]} ${year}`;
                  })()}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center gap-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filteredPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {filteredPieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--color-card-foreground)",
                    }}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {filteredPieData.map((item, i) => {
                const total = filteredPieData.reduce((s, d) => s + d.value, 0);
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="flex-1 truncate text-muted-foreground">{item.name}</span>
                    <span className="font-mono font-medium">{item.value}</span>
                    <span className="text-muted-foreground w-9 text-right">({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Tabs */}
      <Tabs defaultValue="global" className="space-y-4">
        <TabsList className="bg-muted/50 flex w-full overflow-x-auto justify-start">
          <TabsTrigger value="global">Vue globale</TabsTrigger>
          <TabsTrigger value="faune" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Suivi faune
          </TabsTrigger>
          <TabsTrigger value="reboisement" className="gap-1.5">
            <TreePine className="h-3.5 w-3.5" /> Suivi reboisement
          </TabsTrigger>
          <TabsTrigger value="planting" className="gap-1.5">
            <Sprout className="h-3.5 w-3.5" /> Suivi planting
          </TabsTrigger>
          <TabsTrigger value="menaces" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Suivi menaces
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Équipes et missions
          </TabsTrigger>
          {isAdminUser && (
            <TabsTrigger value="ecogardes" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Écogardes
            </TabsTrigger>
          )}
          <TabsTrigger value="activites">Par activité</TabsTrigger>
          {!isViewer && <TabsTrigger value="list">Formulaires</TabsTrigger>}
        </TabsList>

        {/* ─── Vue globale ──────────────────────────────────────── */}
        <TabsContent value="global">
          {!filteredGlobal ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Barre de filtres internes */}
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-3">
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground shrink-0">
                      <Filter className="h-3.5 w-3.5" />
                      Filtres
                    </div>

                    {/* Forêt */}
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select value={globalForest} onValueChange={setGlobalForest}>
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue placeholder="Forêt" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Toutes les forêts</SelectItem>
                          {allForests.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Formulaire */}
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select value={globalFormFilter} onValueChange={setGlobalFormFilter}>
                        <SelectTrigger className="h-8 w-[200px] text-xs">
                          <SelectValue placeholder="Formulaire" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous les formulaires</SelectItem>
                          {filteredGlobal.forms.map((f) => (
                            <SelectItem key={f.form_key} value={f.form_key}>
                              {FORM_META[f.form_key]?.label ?? f.form_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Recherche */}
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        placeholder="Rechercher un indicateur…"
                        className="h-8 pl-7 pr-7 text-xs"
                      />
                      {globalSearch && (
                        <button
                          type="button"
                          onClick={() => setGlobalSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Effacer la recherche"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Tri */}
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select
                        value={globalSort}
                        onValueChange={(v) =>
                          setGlobalSort(v as "none" | "value_desc" | "value_asc" | "name_asc")
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue placeholder="Tri" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Ordre par défaut</SelectItem>
                          <SelectItem value="value_desc">Valeur ↓</SelectItem>
                          <SelectItem value="value_asc">Valeur ↑</SelectItem>
                          <SelectItem value="name_asc">Nom (A→Z)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Reset */}
                    {globalFiltersActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={resetGlobalFilters}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Réinitialiser
                      </Button>
                    )}
                  </div>

                  {globalFiltersActive && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {globalTotalIndicators} indicateur{globalTotalIndicators > 1 ? "s" : ""} affiché{globalTotalIndicators > 1 ? "s" : ""}
                      </Badge>
                      {globalForest !== "all" && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          Forêt : {globalForest}
                        </Badge>
                      )}
                      {globalFormFilter !== "all" && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          {FORM_META[globalFormFilter]?.label ?? globalFormFilter}
                        </Badge>
                      )}
                      {globalSearch && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          « {globalSearch} »
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sections par formulaire */}
              {displayGlobal && displayGlobal.forms.some((f) => f.indicators.length > 0) ? (
                <div className="space-y-6">
                  {displayGlobal.forms
                    .filter((f) => f.indicators.length > 0)
                    .map((formData) => (
                      <FormIndicatorsSection key={formData.form_key} formData={formData} />
                    ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Aucun indicateur ne correspond aux filtres sélectionnés.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Suivi par type de formulaire ─────────────────────── */}
        {([
          { value: "faune", key: "monitoring_faune" },
          { value: "reboisement", key: "monitoring_reboisement" },
          { value: "planting", key: "planting_arbre" },
          { value: "menaces", key: "menaces" },
        ] as const).map(({ value, key }) => {
          const formData = globalIndicators?.forms.find((f) => f.form_key === key);
          const byForestForm = byForest?.forms.find((f) => f.form_key === key);
          return (
            <TabsContent key={value} value={value}>
              <CategoryTabContent
                formKey={key}
                globalForm={formData}
                byForestForm={byForestForm}
                selectedForest={globalForest}
                onForestChange={setGlobalForest}
              />
            </TabsContent>
          );
        })}

        {/* ─── Équipes et missions ────────────────────────────── */}
        <TabsContent value="teams">
          <TeamMissionsTable data={teamMissions} />
        </TabsContent>

        {/* ─── Écogardes (Admin/Superadmin uniquement) ────── */}
        {isAdminUser && (
          <TabsContent value="ecogardes">
            <EcogardesTab
              isAdmin={isAdminUser}
              initialProfiles={ecogardesProfiles}
            />
          </TabsContent>
        )}

        {/* ─── Par activité ─────────────────────────────────── */}
        <TabsContent value="activites">
          <div className="grid sm:grid-cols-2 gap-4">
            {configuredForms.map((form, i) => {
              const meta = FORM_META[form.key] ?? {
                label: form.name,
                description: "",
                icon: FileText,
                color: COLORS[i % COLORS.length],
              };
              const Icon = meta.icon;
              const isExpanded = expandedKey === form.key;
              const kpi = formKpis[form.key];
              const isLoadingThis = kpiLoading === form.key;

              return (
                <Card key={form.key} className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${meta.color}20` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: meta.color }} />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm leading-tight">{meta.label}</CardTitle>
                          <CardDescription className="text-xs mt-0.5 line-clamp-2">
                            {meta.description}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge
                        variant={form.deployment_status === "deployed" ? "default" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {form.deployment_status === "deployed" ? "Déployé" : "Brouillon"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-muted-foreground">Observations</span>
                      <span className="text-2xl font-bold">{countFor(form)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{form.uid}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => handleToggleKpi(form.key)}
                    >
                      {isLoadingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {isExpanded ? "Masquer les KPI" : "Voir les KPI détaillés"}
                    </Button>
                    {isExpanded && !isLoadingThis && (
                      <div className="border rounded-lg overflow-hidden">
                        {!kpi || kpi.indicators.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">
                            Aucune donnée disponible pour ce formulaire
                          </p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                                  Indicateur
                                </th>
                                <th className="text-right px-3 py-2 text-muted-foreground font-medium">
                                  Valeur
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {kpi.indicators.map((ind, j) => (
                                <tr key={j} className="border-t hover:bg-muted/20">
                                  <td className="px-3 py-2 font-mono text-muted-foreground">
                                    {ind.indicator_name}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold">
                                    {ind.value}
                                    {ind.unit ? (
                                      <span className="text-muted-foreground font-normal ml-1">
                                        {ind.unit}
                                      </span>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── Évolution temporelle ─────────────────────────── */}
        <TabsContent value="bar">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Évolution des observations par activité</CardTitle>
                  <CardDescription>Progression mensuelle des suivis terrain</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={timelineMode === "monthly" ? "default" : "outline"}
                    onClick={() => setTimelineMode("monthly")}
                  >
                    Mensuel
                  </Button>
                  <Button
                    size="sm"
                    variant={timelineMode === "cumulative" ? "default" : "outline"}
                    onClick={() => setTimelineMode("cumulative")}
                  >
                    Cumulatif
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-96">
              {timeline.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée de chronologie disponible.
                </div>
              ) : (() => {
                // Construire les cumuls par clé
                const cumulMap: Record<string, number> = {};
                configuredForms.forEach((f) => { cumulMap[f.key] = 0; });

                const chartData = timeline.map((entry) => {
                  const point: Record<string, string | number> = { month: String(entry.month) };
                  configuredForms.forEach((f) => {
                    const monthly = Number(entry[f.key] ?? 0);
                    if (timelineMode === "cumulative") {
                      cumulMap[f.key] += monthly;
                      point[f.key] = cumulMap[f.key];
                    } else {
                      point[f.key] = monthly;
                    }
                  });
                  return point;
                });

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ bottom: 20, right: 24, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        stroke="var(--color-border)"
                        angle={-20}
                        textAnchor="end"
                        height={44}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                        stroke="var(--color-border)"
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "var(--color-card-foreground)",
                        }}
                        formatter={(value: number, key: string) => [
                          value,
                          FORM_META[key]?.label ?? key,
                        ]}
                      />
                      <Legend
                        formatter={(key: string) => FORM_META[key]?.label ?? key}
                        wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                      />
                      {configuredForms.map((f) => {
                        const color = FORM_META[f.key]?.color ?? COLORS[0];
                        return (
                          <Line
                            key={f.key}
                            type="monotone"
                            dataKey={f.key}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 3, fill: color }}
                            activeDot={{ r: 5 }}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Répartition ──────────────────────────────────── */}
        <TabsContent value="pie">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition des observations</CardTitle>
                <CardDescription>Part de chaque activité</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      label={({ name, percent, x, y }) => (
                        <text
                          x={x}
                          y={y}
                          fill="var(--color-foreground)"
                          fontSize={11}
                          textAnchor="middle"
                        >
                          {`${name} (${(percent * 100).toFixed(0)}%)`}
                        </text>
                      )}
                      labelLine={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "var(--color-card-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Détail par activité</CardTitle>
                <CardDescription>Progression par rapport au total</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {configuredForms.map((f, i) => {
                  const label = FORM_META[f.key]?.label ?? f.name;
                  const pct =
                    totalSubmissions > 0
                      ? Math.round((countFor(f) / totalSubmissions) * 100)
                      : 0;
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="truncate">{label}</span>
                        </span>
                        <span className="font-mono text-xs text-muted-foreground ml-2">
                          {countFor(f)} ({pct}%)
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Liste formulaires ────────────────────────────── */}
        {!isViewer && <TabsContent value="list">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Formulaires configurés</CardTitle>
                  <CardDescription>Activités KoboToolbox du projet TechFOREST</CardDescription>
                </div>
                <Badge variant="outline">{configuredForms.length} formulaires</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <div className={`grid ${isSuperadminUser ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto]"} gap-4 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground`}>
                  <span>Activité</span>
                  <span>Formulaire</span>
                  <span className="text-right w-24">Observations</span>
                  <span className="text-right w-24">Statut</span>
                  {isSuperadminUser && <span className="text-right w-16">Lien</span>}
                </div>
                {configuredForms.map((f, i) => {
                  const meta = FORM_META[f.key];
                  const Icon = meta?.icon ?? FileText;
                  return (
                    <div
                      key={f.uid}
                      className={`grid ${isSuperadminUser ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto]"} gap-4 items-center px-4 py-3 border-t text-sm hover:bg-muted/30 transition-colors`}
                    >
                      <div
                        className="h-7 w-7 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: `${meta?.color ?? COLORS[i % COLORS.length]}20` }}
                      >
                        <Icon
                          className="h-3.5 w-3.5"
                          style={{ color: meta?.color ?? COLORS[i % COLORS.length] }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{meta?.label ?? f.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {f.uid}
                        </p>
                      </div>
                      <div className="text-right w-24">
                        <span className="font-bold text-base">{countFor(f)}</span>
                      </div>
                      <div className="text-right w-24">
                        <Badge
                          variant={f.deployment_status === "deployed" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {f.deployment_status === "deployed" ? "Déployé" : f.deployment_status}
                        </Badge>
                      </div>
                      {isSuperadminUser && (
                        <div className="text-right w-16">
                          <a
                            href={`${koboBaseUrl}/#/forms/${f.uid}/landing`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Ouvrir dans KoboToolbox"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
