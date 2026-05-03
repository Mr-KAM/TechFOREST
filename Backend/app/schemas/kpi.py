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


class LocationsResponse(BaseModel):
    total: int
    locations: list[SubmissionLocation]
