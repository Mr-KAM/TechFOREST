import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/useTheme";
import { getZones, getPublicSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TreePine,
  Map,
  BarChart3,
  Satellite,
  Shield,
  Globe,
  Sun,
  Moon,
  ArrowRight,
  Play,
  Trees,
  Sprout,
} from "lucide-react";

const STATIC_STATS = [
  { label: "Zones forestières", value: "2+", icon: Map },
  { label: "Sécurité", value: "JWT", icon: Shield },
];

const FEATURES = [
  {
    title: "Cartographie interactive",
    description:
      "Carte Leaflet avec superposition de couches Google Earth Engine : couverture, NDVI, perte, occupation du sol.",
    icon: Globe,
    color: "bg-emerald-500/10 text-emerald-500",
  },
  {
    title: "Analyses satellite",
    description:
      "8 analyses : couverture forestière, perte, gain, NDVI, occupation du sol (Dynamic World), altitude, pente, ombrage.",
    icon: Satellite,
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    title: "Indicateurs terrain",
    description:
      "Connexion KoboToolbox pour suivre les formulaires de collecte et les soumissions terrain en temps réel.",
    icon: BarChart3,
    color: "bg-amber-500/10 text-amber-500",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const { resolved, setTheme } = useTheme();
  const [totalArea, setTotalArea] = useState<number | null>(null);
  const [treesPlanted, setTreesPlanted] = useState<number | null>(null);

  useEffect(() => {
    getZones()
      .then((zones) => {
        const sum = zones.reduce((acc, z) => acc + (z.area_ha ?? 0), 0);
        setTotalArea(sum);
      })
      .catch(() => setTotalArea(0));
    getPublicSummary()
      .then((s) => setTreesPlanted(s.trees_planted))
      .catch(() => setTreesPlanted(0));
  }, []);

  const areaLabel =
    totalArea === null
      ? "…"
      : totalArea >= 1000
        ? `${(totalArea / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k`
        : totalArea.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  const treesLabel =
    treesPlanted === null
      ? "…"
      : treesPlanted >= 1000
        ? `${(treesPlanted / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k`
        : treesPlanted.toLocaleString("fr-FR");

  const STATS = [
    STATIC_STATS[0],
    { label: "Superficie suivie (ha)", value: areaLabel, icon: Trees },
    { label: "Arbres reboisés", value: treesLabel, icon: Sprout },
    STATIC_STATS[1],
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Fixed top nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <TreePine className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Tech<span className="text-primary">FOREST</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
            >
              {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <Link to="/dashboard">
                <Button size="sm" className="gap-1.5">
                  Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button size="sm">Se connecter</Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-[85vh] items-center justify-center overflow-hidden pt-14">
        {/* Video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/api/media/videos/drone" type="video/mp4" />
        </video>

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background" />

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center text-white">
          <Badge variant="secondary" className="mb-6 bg-white/10 text-white/90 backdrop-blur-sm border-white/20">
            Monitoring forestier par télédétection
          </Badge>

          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            Tech<span className="text-primary">FOREST</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">
            Plateforme de suivi de la couverture forestière combinant imagerie
            satellite Google Earth Engine et collecte de données terrain KoboToolbox.
          </p>

          {/* Stats */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md"
              >
                <s.icon className="mx-auto mb-1.5 h-5 w-5 text-primary" />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-[11px] text-white/60">{s.label}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {user ? (
              <>
                <Link to="/dashboard">
                  <Button size="lg" className="h-12 gap-2 px-8 text-base">
                    <Map className="h-5 w-5" /> Accéder au dashboard
                  </Button>
                </Link>
                <Link to="/kpi">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 gap-2 px-8 text-base bg-white/10 backdrop-blur-md border-white/30 text-white hover:bg-white hover:text-black"
                  >
                    <BarChart3 className="h-5 w-5" /> KPI Terrain
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button size="lg" className="h-12 gap-2 px-8 text-base">
                    <Shield className="h-5 w-5" /> Se connecter
                  </Button>
                </Link>
                <a href="#features">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 gap-2 px-8 text-base bg-white/10 backdrop-blur-md border-white/30 text-white hover:bg-white hover:text-black"
                  >
                    En savoir plus
                  </Button>
                </a>
              </>
            )}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="h-5 w-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Badge variant="outline" className="mb-4">
            Fonctionnalités
          </Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">Tout pour le suivi forestier</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Un système complet alimenté par Google Earth Engine et KoboToolbox pour l'analyse et le monitoring des forêts.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card
              key={f.title}
              className="group relative overflow-hidden transition-shadow hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${f.color}`}
                >
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </CardContent>
              {/* Subtle hover border accent */}
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary scale-x-0 transition-transform group-hover:scale-x-100" />
            </Card>
          ))}
        </div>
      </section>

      {/* ── Video section ── */}
      <section className="border-t bg-muted/50 py-24 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="outline" className="mb-4">
            Démonstration
          </Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">Présentation vidéo</h2>
          <p className="mt-3 text-muted-foreground">
            Découvrez TechFOREST en action — survol par drone et démonstration de la plateforme.
          </p>
          <div className="relative mt-10 overflow-hidden rounded-2xl border bg-card shadow-xl">
            <video controls className="w-full" poster="/api/media/videos/drone">
              <source src="/api/media/videos/presentation" type="video/mp4" />
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>
            {/* Play overlay for visual appeal */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity [:not(:has(video[controls]))_&]:opacity-100">
              <div className="rounded-full bg-primary/90 p-5">
                <Play className="h-8 w-8 text-primary-foreground" fill="currentColor" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-10 text-center">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex items-center justify-center gap-2 mb-3">
            <TreePine className="h-5 w-5 text-primary" />
            <span className="font-bold">TechFOREST</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} AVOCET AGRI — Monitoring forestier par télédétection.
          </p>
        </div>
      </footer>
    </div>
  );
}
