from pydantic import BaseModel


class KoboForm(BaseModel):
    key: str | None = None
    uid: str
    name: str
    deployment_status: str | None = None
    submission_count: int | None = None


class KoboSubmission(BaseModel):
    id: int
    data: dict


class KoboFormSummary(BaseModel):
    key: str | None = None
    uid: str
    name: str
    submissions: int


class KoboDashboard(BaseModel):
    """Résumé global de tous les formulaires (pour le frontend)."""
    total_forms: int
    total_submissions: int
    forms: list[KoboFormSummary]


class KPIValue(BaseModel):
    indicator_name: str
    value: float | int | str
    unit: str | None = None
    period: str | None = None


class KPIDashboard(BaseModel):
    form_uid: str
    form_name: str
    total_submissions: int
    indicators: list[KPIValue]


class FormIndicators(BaseModel):
    """Indicateurs métier calculés pour un formulaire configuré."""
    form_key: str
    form_name: str
    total_submissions: int
    indicators: list[KPIValue]


class GlobalIndicators(BaseModel):
    """Indicateurs agrégés pour les 4 formulaires configurés."""
    total_submissions: int
    forms: list[FormIndicators]


class SubmissionLocation(BaseModel):
    """Un point GPS extrait d'une soumission Kobo."""
    form_key: str
    form_name: str
    submission_id: int | str | None = None
    submitted_at: str | None = None
    latitude: float
    longitude: float
    altitude: float | None = None
    accuracy: float | None = None
    label: str | None = None  # Étiquette descriptive (ex. type de menace, espèce)
    image_url: str | None = None  # URL de la première image jointe à la soumission


class LocationsResponse(BaseModel):
    total: int
    locations: list[SubmissionLocation]


class EcogardeStats(BaseModel):
    """Statistiques agrégées pour un écogarde."""
    username: str
    total_submissions: int
    total_missions: int
    forms_covered: int
    by_form: dict[str, int]


class EcogardesResponse(BaseModel):
    total_ecogardes: int
    total_submissions: int
    total_missions: int
    ecogardes: list[EcogardeStats]


class FormForests(BaseModel):
    """Liste des forêts détectées dans les soumissions d'un formulaire."""
    form_key: str
    form_name: str
    forests: list[str]


class ForestsResponse(BaseModel):
    forms: list[FormForests]
    all_forests: list[str]


class FormIndicatorsByForest(BaseModel):
    """Indicateurs ventilés par forêt pour un formulaire."""
    form_key: str
    form_name: str
    total_submissions: int
    by_forest: dict[str, list[KPIValue]]
    submissions_by_forest: dict[str, int]


class IndicatorsByForestResponse(BaseModel):
    forms: list[FormIndicatorsByForest]


class CountedItem(BaseModel):
    name: str
    value: int


class HealthByForest(BaseModel):
    forest: str
    vivants: int
    morts: int
    degrades: int


class HealthBySpecies(BaseModel):
    espece: str
    vivants: int
    morts: int
    degrades: int


class HealthByParcel(BaseModel):
    parcelle: str
    vivants: int
    morts: int
    degrades: int


class FactorByForest(BaseModel):
    forest: str
    factor: str
    value: int


class FactorDominant(BaseModel):
    name: str
    value: int
    pct: float


class ReboisementQualityMetrics(BaseModel):
    taux_photo_arbre_pct: float
    taux_commentaire_arbre_pct: float
    taux_photo_equipe_pct: float
    taux_signature_pct: float
    arbres_total: int
    missions_total: int


class ReboisementJaccardPair(BaseModel):
    forest_a: str
    forest_b: str
    species_a: int
    species_b: int
    common: int
    jaccard: float


class ReboisementBreakdowns(BaseModel):
    """Distributions détaillées pour les graphiques du formulaire reboisement."""
    top_species: list[CountedItem]
    top_local_names: list[CountedItem]
    factors: list[CountedItem]
    by_parcelle: list[CountedItem]
    by_responsable: list[CountedItem]
    health_by_forest: list[HealthByForest]
    health_by_species: list[HealthBySpecies] = []
    health_by_parcel: list[HealthByParcel] = []
    richesse_by_forest: list[CountedItem] = []
    factors_by_forest: list[FactorByForest] = []
    factor_dominant: FactorDominant | None = None
    jaccard_pairs: list[ReboisementJaccardPair] = []
    quality_metrics: ReboisementQualityMetrics | None = None


# ─── Planting (suivi des plantations) ─────────────────────────


class PlantingEspeceItem(BaseModel):
    name: str
    code: str
    plants: int
    parcelles: int


class PlantingParcelleItem(BaseModel):
    parcelle: str
    plants: int
    forest: str
    surface_ha: float


class PlantingForestSurface(BaseModel):
    forest: str
    surface_ha: float


class PlantingEspeceByForest(BaseModel):
    forest: str
    espece: str
    value: int


class PlantingTimelinePoint(BaseModel):
    date: str
    missions: int


class PlantingCoherenceRow(BaseModel):
    parcelle: str
    declares: int
    comptes: int
    ecart: int


class PlantingParcelDetail(BaseModel):
    parcelle: str
    forest: str
    surface_ha: float
    nb_especes: int
    plants_declares: int
    plants_comptes: int
    type_reboisement: str
    origine_plants: str
    responsable: str
    date: str


class PlantingQualityMetrics(BaseModel):
    taux_photo_parcelle_pct: float
    taux_delimitation_pct: float
    taux_gps_centre_pct: float
    taux_photo_equipe_pct: float
    taux_signature_pct: float
    taux_commentaire_pct: float
    taux_coherence_pct: float
    plants_total: int
    plants_declares_total: int
    missions_total: int


class PlantingBreakdowns(BaseModel):
    """Distributions détaillées pour les graphiques du formulaire planting_arbre."""
    top_especes: list[PlantingEspeceItem] = []
    plants_par_parcelle: list[PlantingParcelleItem] = []
    plants_par_forest: list[CountedItem] = []
    surface_par_forest: list[PlantingForestSurface] = []
    type_reboisement: list[CountedItem] = []
    origine_plants: list[CountedItem] = []
    organisme_don: list[CountedItem] = []
    plants_par_responsable: list[CountedItem] = []
    especes_par_forest: list[PlantingEspeceByForest] = []
    timeline: list[PlantingTimelinePoint] = []
    coherence_top: list[PlantingCoherenceRow] = []
    parcelles_detail: list[PlantingParcelDetail] = []
    quality_metrics: PlantingQualityMetrics | None = None


class ForestValue(BaseModel):
    forest: str
    value: int


class DominantIndexByGroup(BaseModel):
    group: str
    indice: str
    value: int


class CompositionItem(BaseModel):
    forest: str
    group: str
    value: int
    pct: float


class RatioObsWater(BaseModel):
    forest: str
    observations: int
    points_eau: int
    ratio: float | None = None


class DistanceToWater(BaseModel):
    forest: str
    mean_distance_m: float
    min_distance_m: float
    max_distance_m: float
    sample_size: int


class JaccardPair(BaseModel):
    forest_a: str
    forest_b: str
    species_a: int
    species_b: int
    common: int
    jaccard: float


class ForestDureeItem(BaseModel):
    forest: str
    value: float


class FauneBreakdowns(BaseModel):
    """Distributions détaillées pour les graphiques du formulaire faune."""
    top_species: list[CountedItem]
    top_scientific_names: list[CountedItem]
    abundance_by_species: list[CountedItem]
    groups: list[CountedItem]
    indices: list[CountedItem]
    indice_dominant_par_groupe: list[DominantIndexByGroup]
    certitude_distribution: list[CountedItem]
    type_observation_distribution: list[CountedItem]
    missions_by_forest: list[ForestValue]
    observations_by_forest: list[ForestValue]
    richesse_by_forest: list[CountedItem]
    richesse_by_group: list[CountedItem]
    composition_by_forest_group: list[CompositionItem]
    points_eau_by_forest: list[ForestValue]
    ratio_observations_points_eau: list[RatioObsWater]
    mean_distance_to_water: list[DistanceToWater]
    jaccard_pairs: list[JaccardPair]
    duree_totale_heures: float
    duree_par_foret: list[ForestDureeItem]
    indice_abondance_horaire: float


# ─── Équipes de terrain ───────────────────────────────────────


class EcogardeInTeam(BaseModel):
    """Statistiques d'un écogarde membre d'une équipe de terrain."""
    username: str
    total_submissions: int
    total_missions: int
    forms_covered: int


class TeamStats(BaseModel):
    """Statistiques agrégées pour une équipe de terrain."""
    team_name: str
    chefs_mission: list[str]
    membres: list[EcogardeInTeam]
    total_submissions: int
    total_missions: int
    forms_covered: int


class TeamsResponse(BaseModel):
    total_teams: int
    total_members: int
    total_submissions: int
    teams: list[TeamStats]


# ─── Tableau de missions par équipe ──────────────────────────


class TeamMissionEntry(BaseModel):
    """Une mission (soumission) avec les infos d'équipe extraites."""
    date_mission: str | None = None
    activite: str
    activite_label: str
    foret: str
    membres: list[str]
    chef_equipe: str | None = None


class TeamMissionsResponse(BaseModel):
    total: int
    missions: list[TeamMissionEntry]


# ─── Menaces forestières ──────────────────────────────────────


class MenacesSummary(BaseModel):
    missions_total: int
    observations_menaces_total: int
    nombre_total_indices: int
    score_moyen_gravite: float
    taux_menaces_graves_pct: float
    taux_menaces_recentes_pct: float
    indice_pression_brut: float
    indice_pression_active: float
    taux_observations_photo_pct: float
    taux_menaces_geolocalisees_pct: float
    duree_totale_heures: float
    observations_par_mission: float
    observations_par_heure: float


class MenacesForestValue(BaseModel):
    forest: str
    value: float | int


class MenacesTypeForestItem(BaseModel):
    forest: str
    type_pression: str
    value: int


class MenacesGraviteItem(BaseModel):
    niveau_gravite: str
    label: str
    value: int


class MenacesGraviteByForestItem(BaseModel):
    forest: str
    niveau_gravite: str
    value: int


class MenacesGraviteByTypeItem(BaseModel):
    type_pression: str
    niveau_gravite: str
    value: int


class MenacesScoreByForest(BaseModel):
    forest: str
    value: float


class MenacesScoreByType(BaseModel):
    type_pression: str
    value: float


class MenacesAncienneteItem(BaseModel):
    anciennete_indice: str
    label: str
    value: int


class MenacesAncienneteByForestItem(BaseModel):
    forest: str
    anciennete_indice: str
    value: int


class MenacesAncienneteByTypeItem(BaseModel):
    type_pression: str
    anciennete_indice: str
    value: int


class MenacesIndicesByType(BaseModel):
    name: str
    value: int


class MenacesIndiceDominantByType(BaseModel):
    type_pression: str
    indice: str | None = None
    value: int


class MenacesIndiceDetailByType(BaseModel):
    type_pression: str
    indice: str
    value: int
    share_pct: float


class MenacesIndiceParForestItem(BaseModel):
    forest: str
    indice: str
    value: int


class MenacesPressureByType(BaseModel):
    type_pression: str
    value: float


class MenacesPrioriteItem(BaseModel):
    type_pression: str
    score: float
    nombre_observations: int
    nombre_indices: int
    score_moyen_gravite: float
    score_moyen_anciennete: float


class MenacesRadarItem(BaseModel):
    forest: str
    type_pression: str
    value: int
    normalized: float


class MenacesJaccardPair(BaseModel):
    forest_a: str
    forest_b: str
    types_a: int
    types_b: int
    common: int
    jaccard: float


class MenacesQualityMetrics(BaseModel):
    taux_observations_photo_pct: float
    taux_observations_commentaire_pct: float
    taux_missions_signature_pct: float
    taux_missions_photo_equipe_pct: float
    taux_geolocalisees_pct: float
    observations_total: int
    missions_total: int


class MenacesBreakdowns(BaseModel):
    """Distributions détaillées pour les graphiques du formulaire menaces."""
    summary: MenacesSummary
    types_pression: list[CountedItem]
    indices_pression: list[CountedItem]
    indices_dominants_par_type: list[MenacesIndiceDominantByType]
    indices_detail_par_type: list[MenacesIndiceDetailByType] = []
    indices_par_type: list[MenacesIndicesByType]
    indices_par_forest: list[MenacesForestValue]
    indices_pression_par_forest: list[MenacesIndiceParForestItem]
    observations_par_forest: list[MenacesForestValue]
    missions_par_forest: list[MenacesForestValue]
    types_par_forest: list[MenacesTypeForestItem]
    gravite_distribution: list[MenacesGraviteItem]
    gravite_par_forest: list[MenacesGraviteByForestItem]
    gravite_par_type: list[MenacesGraviteByTypeItem]
    score_gravite_par_forest: list[MenacesScoreByForest]
    score_gravite_par_type: list[MenacesScoreByType]
    anciennete_distribution: list[MenacesAncienneteItem]
    anciennete_par_forest: list[MenacesAncienneteByForestItem]
    anciennete_par_type: list[MenacesAncienneteByTypeItem]
    pression_par_forest: list[MenacesForestValue]
    pression_par_type: list[MenacesPressureByType]
    priorite_par_type: list[MenacesPrioriteItem]
    radar_profile: list[MenacesRadarItem]
    jaccard_pairs: list[MenacesJaccardPair]
    quality_metrics: MenacesQualityMetrics
    autres_libelles: list[CountedItem] = []
