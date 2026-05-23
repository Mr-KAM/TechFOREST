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
