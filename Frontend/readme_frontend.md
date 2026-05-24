# TechFOREST - Frontend

SPA React/Vite du projet TechFOREST : dashboard cartographique, indicateurs KPI KoboToolbox, administration utilisateurs.

## Stack technique

- React 19 + TypeScript 5.7
- Vite 6
- Tailwind CSS v4 + shadcn/ui (Radix UI)
- React Router 7
- Leaflet + react-leaflet (cartographie)
- Recharts (graphiques KPI)
- TanStack Table (tables de donnees)

## Architecture

```text
Frontend/
|- index.html
|- vite.config.ts
|- tsconfig.json
|- package.json
`- src/
   |- main.tsx               # Point d'entree React
   |- App.tsx                # Routing global
   |- index.css              # Tailwind + theme
   |- components/
   |  |- AppLayout.tsx       # Shell (sidebar, header)
   |  `- ui/                 # Composants shadcn/ui
   |- pages/
   |  |- HomePage.tsx
   |  |- LoginPage.tsx
   |  |- DashboardPage.tsx   # Carto Leaflet + couches GEE
   |  |- KpiPage.tsx         # Dashboards KPI Kobo
   |  |- DataTablePage.tsx   # Tables de soumissions
   |  `- AdminPage.tsx       # Gestion utilisateurs (superadmin)
   `- lib/
      `- api.ts              # Client HTTP vers l'API FastAPI
```

## Prerequis

- Node.js 20+
- npm
- Une instance Backend FastAPI accessible (par defaut http://localhost:8000)

## Installation

```bash
cd Frontend
npm install
```

## Lancement en developpement

```bash
npm run dev
```

L'application demarre sur http://localhost:5173. Le proxy Vite redirige `/api/*` vers le backend FastAPI (cf. `vite.config.ts`).

## Build production

```bash
npm run build
npm run preview
```

Les artefacts sont generes dans `dist/`.

## Configuration

- L'URL de l'API backend est definie via le proxy Vite. Pour cibler un backend distant en developpement, modifier `vite.config.ts`.
- L'authentification utilise un JWT stocke cote client et envoye en header `Authorization: Bearer <token>` sur chaque requete protegee.

## Pages principales

| Page              | Route          | Description                                                        |
|-------------------|----------------|--------------------------------------------------------------------|
| Accueil           | `/`            | Presentation publique + acces login                                |
| Connexion         | `/login`       | Authentification (JWT)                                             |
| Dashboard carto   | `/dashboard`   | Carte Leaflet, couches GEE, zones forestieres                      |
| KPI               | `/kpi`         | Indicateurs Kobo (reboisement, planting, faune, menaces, equipes)  |
| Tables            | `/data`        | Tables de soumissions par formulaire                               |
| Administration    | `/admin`       | Gestion utilisateurs (superadmin uniquement)                       |

## Page KPI

Le dashboard KPI consomme les endpoints `/api/kpi/*` du backend. Chaque formulaire Kobo dispose d'une vue dediee :

- **monitoring_reboisement** : indicateurs reboisement + breakdowns (especes, parcelles, taux de survie)
- **planting_arbre** : 29 indicateurs + 13 cartes (donut type/origine, top especes, plants par foret/responsable, surface, timeline, coherence declares vs comptes, table detail parcelles)
- **monitoring_faune** : breakdowns faune
- **menaces** : breakdowns menaces

Chaque vue inclut une carte Leaflet des points geolocalises et des graphiques Recharts.

## Conventions

- Composants UI : utiliser shadcn/ui (`components/ui/`) avant de creer de nouveaux composants.
- Appels API : centraliser dans `src/lib/api.ts` avec des interfaces TypeScript explicites.
- Types : eviter `any`, declarer les schemas de reponse de l'API en miroir des `schemas/` Pydantic du backend.