import { useEffect, useState } from "react";
import {
  getConfiguredKoboForms,
  getFormKpiDashboard,
  getGlobalIndicators,
  type KoboFormConfigured,
  type FormKpiDashboard,
  type GlobalIndicators,
} from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function KpiPage() {
  const [configuredForms, setConfiguredForms] = useState<KoboFormConfigured[]>([]);
  const [globalIndicators, setGlobalIndicators] = useState<GlobalIndicators | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [formKpis, setFormKpis] = useState<Record<string, FormKpiDashboard>>({});
  const [kpiLoading, setKpiLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async () => {
    const [forms, indicators] = await Promise.all([
      getConfiguredKoboForms(),
      getGlobalIndicators(),
    ]);
    setConfiguredForms(forms);
    setGlobalIndicators(indicators);
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
  // des soumissions réelles), avec fallback sur submission_count si indispo.
  const realCounts: Record<string, number> = Object.fromEntries(
    (globalIndicators?.forms ?? []).map((f) => [f.form_key, f.total_submissions])
  );
  const countFor = (f: KoboFormConfigured) =>
    realCounts[f.key] ?? f.submission_count ?? 0;

  const totalSubmissions =
    globalIndicators?.total_submissions ??
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
          <h1 className="text-2xl font-bold tracking-tight">KPI Terrain</h1>
          <p className="text-sm text-muted-foreground">
            Indicateurs de collecte KoboToolbox en temps réel
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                formulaires configurés
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Soumissions</CardTitle>
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
              <span className="text-xs text-muted-foreground">soumissions / activité</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="global" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="global">Vue globale</TabsTrigger>
          <TabsTrigger value="activites">Par activité</TabsTrigger>
          <TabsTrigger value="bar">Barres</TabsTrigger>
          <TabsTrigger value="pie">Répartition</TabsTrigger>
          <TabsTrigger value="list">Formulaires</TabsTrigger>
        </TabsList>

        {/* ─── Vue globale ──────────────────────────────────────── */}
        <TabsContent value="global">
          {!globalIndicators ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {globalIndicators.forms.map((formData) => {
                const meta = FORM_META[formData.form_key];
                const FormIcon = meta?.icon ?? FileText;
                const formColor = meta?.color ?? "#6b7280";
                return (
                  <div key={formData.form_key} className="space-y-3">
                    {/* Form section header */}
                    <div className="flex items-center gap-2">
                      <div
                        className="h-7 w-7 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: `${formColor}20` }}
                      >
                        <FormIcon className="h-4 w-4" style={{ color: formColor }} />
                      </div>
                      <h3 className="text-sm font-semibold">{meta?.label ?? formData.form_name}</h3>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {formData.total_submissions} soumissions
                      </Badge>
                    </div>
                    {/* Indicator cards grid */}
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
              })}
            </div>
          )}
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
                      <span className="text-xs text-muted-foreground">Soumissions</span>
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

        {/* ─── Barres ───────────────────────────────────────── */}
        <TabsContent value="bar">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Soumissions par activité</CardTitle>
              <CardDescription>Nombre de soumissions par formulaire KoboToolbox</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    angle={-15}
                    textAnchor="end"
                    height={60}
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
                  <Bar dataKey="submissions" radius={[6, 6, 0, 0]}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Répartition ──────────────────────────────────── */}
        <TabsContent value="pie">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition des soumissions</CardTitle>
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
        <TabsContent value="list">
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
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  <span>Activité</span>
                  <span>Formulaire</span>
                  <span className="text-right w-24">Soumissions</span>
                  <span className="text-right w-24">Statut</span>
                </div>
                {configuredForms.map((f, i) => {
                  const meta = FORM_META[f.key];
                  const Icon = meta?.icon ?? FileText;
                  return (
                    <div
                      key={f.uid}
                      className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-4 py-3 border-t text-sm hover:bg-muted/30 transition-colors"
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
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
