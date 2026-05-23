import { useEffect, useMemo, useState } from "react";
import {
  getConfiguredKoboForms,
  getFormKpiDashboard,
  getGlobalIndicators,
  getEcogardesStats,
  getTeamsStats,
  getTeamMissions,
  getIndicatorsByForest,
  getTimeline,
  type TimelineEntry,
  type KoboFormConfigured,
  type FormKpiDashboard,
  type GlobalIndicators,
  type EcogardesResponse,
  type TeamsResponse,
  type TeamStats,
  type TeamMissionsResponse,
  type TeamMissionEntry,
  type IndicatorsByForestResponse,
  type FormIndicatorsByForest,
  type KpiIndicator,
} from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, ROLES } from "@/lib/auth";

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
  "Suivis fauniques":         { icon: Footprints, color: "#22d3ee" },
  "Mammifères observés":      { icon: Footprints, color: "#0ea5e9" },
  "Oiseaux observés":         { icon: Bird,       color: "#06b6d4" },
  "Reptiles observés":        { icon: Fish,       color: "#0891b2" },
  "Amphibiens observés":      { icon: Fish,       color: "#0e7490" },
  "Invertébrés observés":     { icon: Eye,        color: "#155e75" },
  "Rongeurs observés":        { icon: Footprints, color: "#164e63" },
  "Espèces identifiées":      { icon: Leaf,       color: "#22d3ee" },
  "Missions de reboisement":  { icon: TreePine,   color: "#16a34a" },
  "Arbres monitorés":         { icon: Trees,      color: "#15803d" },
  "Espèces reboisées":        { icon: Leaf,       color: "#14532d" },
  "Parcelles identifiées":    { icon: MapPin,     color: "#84cc16" },
  "Arbres plantés":           { icon: Sprout,     color: "#65a30d" },
  "Espèces plantées":         { icon: Leaf,       color: "#4d7c0f" },
  "Superficie plantée":       { icon: MapPin,     color: "#3f6212" },
  "Missions réalisées":       { icon: ClipboardList, color: "#f59e0b" },
  "Signalements de menaces":  { icon: ShieldAlert, color: "#d97706" },
  "Types de menaces":         { icon: AlertTriangle, color: "#b45309" },
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

  // Graphique comparatif par forêt (uniquement si "Toutes" et 2+ forêts)
  const compareData =
    selectedForest === "all" &&
    byForestForm &&
    availableForests.length >= 2
      ? buildCompareData(byForestForm, availableForests)
      : null;

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
      {/* Graphique de synthèse */}
      {synthData.length > 0 && (
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

      {/* Comparatif par forêt */}
      {compareData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comparaison par forêt</CardTitle>
            <CardDescription>
              Indicateurs ventilés par forêt d'intervention
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData.data} margin={{ bottom: 60 }}>
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
                {compareData.forests.map((forest, idx) => (
                  <Bar
                    key={forest}
                    dataKey={forest}
                    fill={COLORS[idx % COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
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

// Construit les données du graphique comparatif par forêt
function buildCompareData(
  byForestForm: FormIndicatorsByForest,
  forests: string[],
): { data: Array<Record<string, string | number>>; forests: string[] } {
  // Indicateurs présents dans au moins une forêt (numériques)
  const indicatorNames = new Set<string>();
  forests.forEach((f) => {
    (byForestForm.by_forest[f] ?? []).forEach((i: KpiIndicator) => {
      if (typeof i.value === "number") indicatorNames.add(i.indicator_name);
    });
  });

  const data = Array.from(indicatorNames).map((name) => {
    const row: Record<string, string | number> = { name };
    forests.forEach((f) => {
      const ind = (byForestForm.by_forest[f] ?? []).find(
        (i) => i.indicator_name === name,
      );
      row[f] = typeof ind?.value === "number" ? ind.value : 0;
    });
    return row;
  });
  return { data, forests };
}

// ─── Composant tableau des missions par équipe ───────────────

const ACTIVITE_COLOR: Record<string, string> = {
  monitoring_faune: "#22d3ee",
  monitoring_reboisement: "#16a34a",
  planting_arbre: "#84cc16",
  menaces: "#f59e0b",
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
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                angle={-35}
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

export default function KpiPage() {
  const { user } = useAuth();
  const isViewer = user?.role === ROLES.VIEWER;
  const isSuperadminUser = user?.role === ROLES.SUPERADMIN;
  const koboBaseUrl = (import.meta.env.VITE_KOBO_URL as string | undefined) ?? "https://kf.kobotoolbox.org";
  const [configuredForms, setConfiguredForms] = useState<KoboFormConfigured[]>([]);
  const [globalIndicators, setGlobalIndicators] = useState<GlobalIndicators | null>(null);
  const [ecogardes, setEcogardes] = useState<EcogardesResponse | null>(null);
  const [teams, setTeams] = useState<TeamsResponse | null>(null);
  const [teamMissions, setTeamMissions] = useState<TeamMissionsResponse | null>(null);
  const [byForest, setByForest] = useState<IndicatorsByForestResponse | null>(null);
  const [globalForest, setGlobalForest] = useState<string>("all");
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
    const [forms, indicators, ecg, tm, bf, tl, tmissions] = await Promise.all([
      getConfiguredKoboForms(),
      getGlobalIndicators(),
      getEcogardesStats().catch(() => null),
      getTeamsStats().catch(() => null),
      getIndicatorsByForest().catch(() => null),
      getTimeline().catch(() => [] as TimelineEntry[]),
      getTeamMissions().catch(() => null),
    ]);
    setConfiguredForms(forms);
    setGlobalIndicators(indicators);
    setEcogardes(ecg);
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
          <TabsTrigger value="ecogardes" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Écogardes
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Équipes
          </TabsTrigger>
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
            <div className="space-y-6">
              {filteredGlobal.forms.map((formData) => (
                <FormIndicatorsSection key={formData.form_key} formData={formData} />
              ))}
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

        {/* ─── Écogardes ───────────────────────────────────── */}
        <TabsContent value="ecogardes">
          {!ecogardes ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Aucune donnée disponible.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Agents collecteurs
                    </CardTitle>
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{ecogardes.total_ecogardes}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-5">
                        membres de l'équipe
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Observations collectées
                    </CardTitle>
                    <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <Database className="h-4 w-4 text-cyan-500" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {ecogardes.total_submissions}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-5">
                        toutes activités
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Sorties terrain
                    </CardTitle>
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <ClipboardList className="h-4 w-4 text-amber-500" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {ecogardes.total_missions}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      jours de collecte cumulés
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Observations par agent collecteur
                  </CardTitle>
                  <CardDescription>
                    Top des membres de l'équipe terrain (toutes activités confondues)
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ecogardes.ecogardes.slice(0, 15).map((e) => ({
                        name: e.username,
                        observations: e.total_submissions,
                        missions: e.total_missions,
                      }))}
                      margin={{ bottom: 50 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        angle={-25}
                        textAnchor="end"
                        height={70}
                        stroke="var(--color-border)"
                        interval={0}
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
                        formatter={(v: number, k: string) => [
                          v,
                          k === "observations" ? "Observations" : "Sorties terrain",
                        ]}
                      />
                      <Legend
                        formatter={(k: string) =>
                          k === "observations" ? "Observations" : "Sorties terrain"
                        }
                        wrapperStyle={{ fontSize: "12px" }}
                      />
                      <Bar dataKey="observations" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="missions" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Équipe de collecte</CardTitle>
                  <CardDescription>
                    Détail par membre — observations, sorties terrain et activités couvertes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="py-2 pr-3 font-medium">Agent</th>
                          <th className="py-2 pr-3 font-medium text-right">
                            Observations
                          </th>
                          <th className="py-2 pr-3 font-medium text-right">
                            Sorties terrain
                          </th>
                          <th className="py-2 pr-3 font-medium text-right">
                            Activités
                          </th>
                          <th className="py-2 pr-3 font-medium">Détail activités</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ecogardes.ecogardes.map((e) => (
                          <tr key={e.username} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Users className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <span className="font-medium">{e.username}</span>
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-right font-bold">
                              {e.total_submissions}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {e.total_missions}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {e.forms_covered}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(e.by_form).map(([key, count]) => (
                                  <Badge
                                    key={key}
                                    variant="outline"
                                    className="text-[10px]"
                                    style={{
                                      borderColor: `${FORM_META[key]?.color ?? "#6b7280"}40`,
                                      color: FORM_META[key]?.color,
                                    }}
                                  >
                                    {FORM_META[key]?.label ?? key} : {count}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {ecogardes.ecogardes.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="py-6 text-center text-muted-foreground"
                            >
                              Aucun agent identifié dans les observations.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── Équipes de terrain ───────────────────────────── */}
        <TabsContent value="teams">
          <TeamMissionsTable data={teamMissions} />
        </TabsContent>

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
