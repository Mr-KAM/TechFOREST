from pydantic import BaseModel


class KoboForm(BaseModel):
    uid: str
    name: str
    deployment_status: str | None = None
    submission_count: int | None = None


class KoboSubmission(BaseModel):
    id: int
    data: dict


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
