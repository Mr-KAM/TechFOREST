from pydantic import BaseModel


class KoboForm(BaseModel):
    uid: str
    name: str
    deployment_status: str | None = None
    submission_count: int | None = None


class KoboSubmission(BaseModel):
    id: int
    data: dict


class KoboFormSummary(BaseModel):
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
