import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  getZones,
  clipGEE,
  getLocations,
  type ForestZone,
  type GEEClipResponse,
  type SubmissionLocation,
} from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layers, ChevronRight, ChevronLeft, Eye, EyeOff, Satellite, SlidersHorizontal, X, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const LAYER_TYPES = [
  { value: "tree_cover", label: "Couverture forestière" },
  { value: "forest_loss", label: "Perte de forêt" },
  { value: "forest_gain", label: "Gain de forêt" },
  { value: "ndvi", label: "NDVI (Sentinel-2)" },
  { value: "land_cover", label: "Occupation du sol" },
  { value: "elevation", label: "Altitude (MNT)" },
  { value: "slope", label: "Pente" },
  { value: "hillshade", label: "Ombrage" },
];

const SUBMISSION_FORM_META: Record<string, { label: string; color: string }> = {
  monitoring_faune: { label: "Suivi faune", color: "#a855f7" },        // violet
  monitoring_reboisement: { label: "Reboisement", color: "#16a34a" },  // vert
  planting_arbre: { label: "Plantation", color: "#0891b2" },           // cyan
  menaces: { label: "Menaces", color: "#dc2626" },                     // rouge
};

const LAND_COVER_CLASSES: Record<string, { label: string; color: string }> = {
  "0": { label: "Eau", color: "#419BDF" },
  "1": { label: "Arbres", color: "#397D49" },
  "2": { label: "Herbe", color: "#88B053" },
  "3": { label: "Végétation inondée", color: "#7A87C6" },
  "4": { label: "Cultures", color: "#E49635" },
  "5": { label: "Arbustes", color: "#DFC35A" },
  "6": { label: "Bâti", color: "#C4281B" },
  "7": { label: "Sol nu", color: "#A59B8F" },
  "8": { label: "Neige/Glace", color: "#B39FE1" },
};

function GEETileLayer({ url, opacity = 0.75 }: { url: string; opacity?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!url) return;
    const cleanUrl = url.trim();
    console.log("[GEE] Adding tile layer:", cleanUrl);
    const layer = L.tileLayer(cleanUrl, {
      maxZoom: 20,
      minZoom: 0,
      opacity,
      zIndex: 400,
      crossOrigin: true,
    });
    layer.addTo(map);
    layer.on("tileerror", (e) => console.error("[GEE] Tile error:", e));
    layer.on("tileload", () => console.log("[GEE] Tile loaded"));
    return () => { map.removeLayer(layer); };
  }, [url, map, opacity]);
  return null;
}

/** Zoom the map to a specific zone geometry */
function ZoomToZone({ geometry }: { geometry: GeoJSON.Geometry | null }) {
  const map = useMap();
  useEffect(() => {
    if (!geometry) return;
    const gj = L.geoJSON(geometry as GeoJSON.GeoJsonObject);
    const bounds = gj.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [geometry, map]);
  return null;
}

function FitBounds({ zones }: { zones: ForestZone[] }) {
  const map = useMap();
  useEffect(() => {
    if (zones.length === 0) return;
    const bounds = L.latLngBounds([]);
    zones.forEach((z) => {
      if (z.geometry) {
        const gj = L.geoJSON(z.geometry);
        bounds.extend(gj.getBounds());
      }
    });
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }, [zones, map]);
  return null;
}

function StatsPanel({ data }: { data: GEEClipResponse }) {
  const { stats, layer_type } = data;

  if (layer_type === "land_cover" && stats.histogram) {
    const hist = stats.histogram as Record<string, number>;
    const total = Object.values(hist).reduce((s, v) => s + v, 0);
    return (
      <div className="space-y-2">
        <h4 className="font-medium text-sm">Occupation du sol – {data.forest_zone_name}</h4>
        {Object.entries(hist)
          .sort((a, b) => b[1] - a[1])
          .map(([key, val]) => {
            const cls = LAND_COVER_CLASSES[key] || { label: `Classe ${key}`, color: "#888" };
            const pct = ((val / total) * 100).toFixed(1);
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: cls.color }} />
                <span className="flex-1">{cls.label}</span>
                <span className="font-mono">{pct}%</span>
              </div>
            );
          })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="font-medium text-sm">Statistiques – {data.forest_zone_name}</h4>
      {Object.entries(stats).map(([k, v]) => (
        <div key={k} className="flex justify-between text-sm">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-mono">{typeof v === "number" ? v.toFixed(4) : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Légendes par type de couche ─────────────────────────────

interface GradientStop { color: string; label: string }

const LAYER_LEGENDS: Record<string, { title: string; type: "classes" | "gradient"; items?: { color: string; label: string }[]; gradient?: GradientStop[] }> = {
  tree_cover: {
    title: "Couverture forestière (%)",
    type: "gradient",
    gradient: [
      { color: "#ffffcc", label: "0%" },
      { color: "#a1dab4", label: "25%" },
      { color: "#41b6c4", label: "50%" },
      { color: "#225ea8", label: "75%" },
      { color: "#0c2c84", label: "100%" },
    ],
  },
  forest_loss: {
    title: "Perte de forêt",
    type: "gradient",
    gradient: [
      { color: "#fff5f0", label: "Faible" },
      { color: "#fb6a4a", label: "Modérée" },
      { color: "#a50f15", label: "Élevée" },
    ],
  },
  forest_gain: {
    title: "Gain de forêt",
    type: "classes",
    items: [
      { color: "#00ff00", label: "Gain détecté" },
      { color: "#transparent", label: "Pas de gain" },
    ],
  },
  ndvi: {
    title: "NDVI (Indice de végétation)",
    type: "gradient",
    gradient: [
      { color: "#d73027", label: "-1 (Sol nu)" },
      { color: "#fee08b", label: "0" },
      { color: "#66bd63", label: "0.5" },
      { color: "#1a9850", label: "0.8" },
      { color: "#006837", label: "1 (Dense)" },
    ],
  },
  land_cover: {
    title: "Occupation du sol (Dynamic World)",
    type: "classes",
    items: Object.values(LAND_COVER_CLASSES).map((c) => ({
      color: c.color,
      label: c.label,
    })),
  },
  elevation: {
    title: "Altitude (m)",
    type: "gradient",
    gradient: [
      { color: "#006837", label: "0 m" },
      { color: "#66bd63", label: "200 m" },
      { color: "#fee08b", label: "500 m" },
      { color: "#f46d43", label: "1000 m" },
      { color: "#a50026", label: "2000 m+" },
    ],
  },
  slope: {
    title: "Pente (degrés)",
    type: "gradient",
    gradient: [
      { color: "#ffffb2", label: "0°" },
      { color: "#fecc5c", label: "10°" },
      { color: "#fd8d3c", label: "25°" },
      { color: "#e31a1c", label: "45°+" },
    ],
  },
  hillshade: {
    title: "Ombrage",
    type: "gradient",
    gradient: [
      { color: "#000000", label: "Ombre" },
      { color: "#666666", label: "" },
      { color: "#ffffff", label: "Éclairé" },
    ],
  },
};

function LegendSidebar({
  layerType,
  geeResult,
  showZones,
  onToggleZones,
  showGeeLayer,
  onToggleGeeLayer,
  geeOpacity,
  onOpacityChange,
  mobileOpen,
  onMobileClose,
  showSubmissions,
  onToggleSubmissions,
  submissionCounts,
}: {
  layerType: string;
  geeResult: GEEClipResponse | null;
  showZones: boolean;
  onToggleZones: () => void;
  showGeeLayer: boolean;
  onToggleGeeLayer: () => void;
  geeOpacity: number;
  onOpacityChange: (v: number) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  showSubmissions: boolean;
  onToggleSubmissions: () => void;
  submissionCounts: Record<string, number>;
}) {
  const [open, setOpen] = useState(true);
  const legend = LAYER_LEGENDS[layerType];

  return (
    <div
      className={cn(
        "flex flex-col border-l bg-card transition-all duration-200",
        // Desktop
        "lg:relative lg:translate-x-0",
        open ? "lg:w-72" : "lg:w-0 lg:overflow-hidden lg:border-l-0",
        // Mobile drawer
        "fixed inset-y-0 right-0 z-40 w-[85vw] max-w-sm",
        mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}
    >
      {/* Toggle button (desktop only) */}
      <button
        onClick={() => setOpen(!open)}
        className="hidden lg:flex absolute -left-7 top-3 z-10 h-7 w-7 items-center justify-center rounded-l-md border border-r-0 bg-card text-muted-foreground shadow-sm hover:bg-accent"
        title={open ? "Masquer la légende" : "Afficher la légende"}
      >
        {open ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Mobile close button */}
      <button
        onClick={onMobileClose}
        className="lg:hidden absolute right-3 top-3 z-10 text-muted-foreground hover:text-foreground"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>

      {(open || mobileOpen) && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ── Couches visibles ── */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Couches</h3>
            <div className="space-y-2">
              {/* Zones toggle */}
              <button
                onClick={onToggleZones}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                {showZones ? (
                  <Eye className="h-4 w-4 text-green-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="inline-block h-3 w-3 rounded border-2 border-green-600 bg-green-600/10" />
                <span>Zones de forêt</span>
              </button>

              {/* GEE layer toggle */}
              {geeResult && (
                <button
                  onClick={onToggleGeeLayer}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  {showGeeLayer ? (
                    <Eye className="h-4 w-4 text-blue-600" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Layers className="h-3 w-3 text-blue-600" />
                  <span className="truncate">
                    {LAYER_TYPES.find((l) => l.value === geeResult.layer_type)?.label ?? geeResult.layer_type}
                  </span>
                </button>
              )}

              {/* Submissions (Kobo) toggle */}
              <button
                onClick={onToggleSubmissions}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                {showSubmissions ? (
                  <Eye className="h-4 w-4 text-amber-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <MapPin className="h-3.5 w-3.5 text-amber-600" />
                <span>Soumissions terrain</span>
              </button>
            </div>

            {/* Sous-légende soumissions par formulaire */}
            {showSubmissions && Object.keys(submissionCounts).length > 0 && (
              <div className="mt-2 ml-1 space-y-1 border-l-2 border-muted pl-2">
                {Object.entries(SUBMISSION_FORM_META).map(([key, meta]) => {
                  const count = submissionCounts[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                        style={{ backgroundColor: meta.color, borderColor: meta.color }}
                      />
                      <span className="flex-1 truncate">{meta.label}</span>
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Opacité GEE ── */}
          {geeResult && showGeeLayer && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Opacité : {Math.round(geeOpacity * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={geeOpacity}
                onChange={(e) => onOpacityChange(Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
            </div>
          )}

          {/* ── Légende ── */}
          {legend && geeResult && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Légende</h3>
              <p className="text-xs text-muted-foreground mb-3">{legend.title}</p>

              {legend.type === "classes" && legend.items && (
                <div className="space-y-1.5">
                  {legend.items.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm">
                      <span
                        className="inline-block h-3.5 w-3.5 shrink-0 rounded"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {legend.type === "gradient" && legend.gradient && (
                <div>
                  <div
                    className="h-4 w-full rounded"
                    style={{
                      background: `linear-gradient(to right, ${legend.gradient.map((s) => s.color).join(", ")})`,
                    }}
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    {legend.gradient.map((s, i) => (
                      <span key={i}>{s.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Stats résumé ── */}
          {geeResult && geeResult.layer_type === "land_cover" && geeResult.stats.histogram && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Répartition</h3>
              {(() => {
                const hist = geeResult.stats.histogram as Record<string, number>;
                const total = Object.values(hist).reduce((s, v) => s + v, 0);
                return (
                  <div className="space-y-1">
                    {Object.entries(hist)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, val]) => {
                        const cls = LAND_COVER_CLASSES[key] || { label: `Classe ${key}`, color: "#888" };
                        const pct = ((val / total) * 100).toFixed(1);
                        return (
                          <div key={key} className="space-y-0.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2.5 w-2.5 rounded" style={{ backgroundColor: cls.color }} />
                                {cls.label}
                              </span>
                              <span className="font-mono">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: cls.color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })()}
            </div>
          )}

          {!geeResult && (
            <p className="text-xs text-muted-foreground italic">
              Lancez une analyse pour afficher la légende et les couches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [zones, setZones] = useState<ForestZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [layerType, setLayerType] = useState<string>("land_cover");
  const [dateStart, setDateStart] = useState("2024-01-01");
  const [dateEnd, setDateEnd] = useState("2024-12-31");
  const [geeResult, setGeeResult] = useState<GEEClipResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysisZoneGeometry, setAnalysisZoneGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [showGeeLayer, setShowGeeLayer] = useState(true);
  const [geeOpacity, setGeeOpacity] = useState(0.75);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [locations, setLocations] = useState<SubmissionLocation[]>([]);
  const [showSubmissions, setShowSubmissions] = useState(true);

  useEffect(() => {
    getZones().then(setZones).catch(console.error);
    getLocations()
      .then((res) => setLocations(res.locations))
      .catch((e) => console.warn("[locations] indisponibles:", e));
  }, []);

  const handleAnalyse = async () => {
    if (!selectedZone) return;
    setLoading(true);
    setError("");
    setGeeResult(null);
    setAnalysisZoneGeometry(null);
    try {
      const result = await clipGEE({
        forest_zone_id: Number(selectedZone),
        layer_type: layerType,
        date_start: dateStart,
        date_end: dateEnd,
      });
      console.log("[GEE] Clip result:", result);
      setGeeResult(result);
      // Zoom to the selected zone
      const zone = zones.find((z) => z.id === Number(selectedZone));
      if (zone?.geometry) {
        setAnalysisZoneGeometry(zone.geometry);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur GEE");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full relative">
      {/* Mobile backdrop */}
      {(mobileControlsOpen || mobileLegendOpen) && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => {
            setMobileControlsOpen(false);
            setMobileLegendOpen(false);
          }}
        />
      )}

      {/* Mobile floating toggles */}
      <div className="lg:hidden absolute top-3 left-3 z-20 flex gap-2">
        <Button
          size="icon"
          variant="secondary"
          className="h-9 w-9 shadow-lg"
          onClick={() => setMobileControlsOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <div className="lg:hidden absolute top-3 right-3 z-20">
        <Button
          size="icon"
          variant="secondary"
          className="h-9 w-9 shadow-lg"
          onClick={() => setMobileLegendOpen(true)}
        >
          <Layers className="h-4 w-4" />
        </Button>
      </div>

      {/* Sidebar gauche — contrôles d'analyse */}
      <aside
        className={cn(
          "shrink-0 border-r bg-card p-4 space-y-4 overflow-y-auto transition-transform duration-200",
          // Desktop
          "lg:relative lg:translate-x-0 lg:w-80",
          // Mobile
          "fixed inset-y-0 left-0 z-40 w-[85vw] max-w-sm",
          mobileControlsOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Satellite className="h-4 w-4 text-primary" /> Analyse GEE
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] h-5">
              {zones.length} zones
            </Badge>
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setMobileControlsOpen(false)}
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Separator />

        <div className="space-y-2">
          <label className="text-sm font-medium">Zone de forêt</label>
          <Select value={selectedZone} onValueChange={setSelectedZone}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={String(z.id)}>
                  {z.name} {z.area_ha ? `(${z.area_ha} ha)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Type de couche</label>
          <Select value={layerType} onValueChange={setLayerType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYER_TYPES.map((lt) => (
                <SelectItem key={lt.value} value={lt.value}>
                  {lt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">Date début</label>
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Date fin</label>
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>
        </div>

        <Button className="w-full h-10" onClick={handleAnalyse} disabled={loading || !selectedZone}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...
            </>
          ) : (
            "Lancer l'analyse"
          )}
        </Button>

        {error && <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</div>}

        {geeResult && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Résultats</CardTitle>
            </CardHeader>
            <CardContent>
              <StatsPanel data={geeResult} />
            </CardContent>
          </Card>
        )}
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[6.8, -5.5]}
          zoom={7}
          className="h-full w-full"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds zones={zones} />

          {showZones &&
            zones.map((z) =>
              z.geometry ? (
                <GeoJSON
                  key={z.id}
                  data={z.geometry as GeoJSON.GeoJsonObject}
                  style={() => ({
                    color: "#16a34a",
                    weight: 2,
                    fillOpacity: 0.1,
                  })}
                  onEachFeature={(_feature, layer) => {
                    layer.bindTooltip(z.name);
                  }}
                />
              ) : null
            )}

          {geeResult?.tile_url && showGeeLayer && (
            <GEETileLayer url={geeResult.tile_url} opacity={geeOpacity} />
          )}

          {showSubmissions &&
            locations.map((loc, idx) => {
              const meta = SUBMISSION_FORM_META[loc.form_key] ?? { label: loc.form_name, color: "#64748b" };
              return (
                <CircleMarker
                  key={`${loc.form_key}-${loc.submission_id ?? "x"}-${idx}`}
                  center={[loc.latitude, loc.longitude]}
                  radius={6}
                  pathOptions={{
                    color: meta.color,
                    weight: 2,
                    fillColor: meta.color,
                    fillOpacity: 0.7,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5">
                      <div className="font-semibold" style={{ color: meta.color }}>
                        {meta.label}
                      </div>
                      <div className="text-muted-foreground">{loc.form_name}</div>
                      {loc.label && <div><span className="font-medium">Détail :</span> {loc.label}</div>}
                      <div className="font-mono text-[10px] mt-1">
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                      </div>
                      {loc.altitude != null && (
                        <div className="text-[10px] text-muted-foreground">
                          Alt. {loc.altitude.toFixed(1)} m
                          {loc.accuracy != null && ` · ±${loc.accuracy.toFixed(1)} m`}
                        </div>
                      )}
                      {loc.submitted_at && (
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(loc.submitted_at).toLocaleString("fr-FR")}
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

          {analysisZoneGeometry && <ZoomToZone geometry={analysisZoneGeometry} />}
        </MapContainer>
      </div>

      {/* Sidebar droite – Légende */}
      <LegendSidebar
        layerType={geeResult?.layer_type ?? layerType}
        geeResult={geeResult}
        showZones={showZones}
        onToggleZones={() => setShowZones((v) => !v)}
        showGeeLayer={showGeeLayer}
        onToggleGeeLayer={() => setShowGeeLayer((v) => !v)}
        geeOpacity={geeOpacity}
        onOpacityChange={setGeeOpacity}
        mobileOpen={mobileLegendOpen}
        onMobileClose={() => setMobileLegendOpen(false)}
        showSubmissions={showSubmissions}
        onToggleSubmissions={() => setShowSubmissions((v) => !v)}
        submissionCounts={locations.reduce<Record<string, number>>((acc, l) => {
          acc[l.form_key] = (acc[l.form_key] ?? 0) + 1;
          return acc;
        }, {})}
      />
    </div>
  );
}
