from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RoleRead(ORMBase):
    id: int
    name: str
    description: str | None = None


class UserRead(ORMBase):
    id: int
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    role: RoleRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserRead


class FlowCreate(BaseModel):
    flow_uid: str | None = None
    src_ip: str
    dst_ip: str
    src_port: int | None = None
    dst_port: int | None = None
    protocol: str
    packet_count: int = Field(ge=0)
    byte_count: int = Field(ge=0)
    packet_rate: float = Field(ge=0)
    flow_duration: float = Field(ge=0)
    feature_snapshot: dict[str, Any] | None = None


class FlowRead(ORMBase):
    id: int
    flow_uid: str | None = None
    src_ip: str
    dst_ip: str
    src_port: int | None = None
    dst_port: int | None = None
    protocol: str
    packet_count: int
    byte_count: int
    packet_rate: float
    flow_duration: float
    feature_snapshot: dict[str, Any] | None = None
    created_at: datetime


class ModelVersionCreate(BaseModel):
    name: str
    version: str
    artifact_path: str
    sha256: str | None = None
    metrics: dict[str, Any] | None = None
    is_active: bool = False


class ModelVersionRead(ORMBase):
    id: int
    name: str
    version: str
    artifact_path: str
    sha256: str | None = None
    metrics: dict[str, Any] | None = None
    is_active: bool
    deployed_at: datetime | None = None
    created_at: datetime


class PredictionRead(ORMBase):
    id: int
    predicted_label: str
    confidence: float
    attack_probability: float
    packet_rate: float
    created_at: datetime


class IncidentCreate(BaseModel):
    flow_id: int | None = None
    prediction_id: int | None = None
    title: str
    description: str | None = None
    severity: str = "medium"
    status: str = "open"


class IncidentRead(ORMBase):
    id: int
    flow_id: int | None = None
    prediction_id: int | None = None
    title: str
    description: str | None = None
    severity: str
    status: str
    created_at: datetime
    updated_at: datetime


class MitigationActionRead(ORMBase):
    id: int
    action_type: str
    command: str
    status: str
    created_at: datetime


class AlertEvaluationRequest(BaseModel):
    flow: FlowCreate
    prediction: dict[str, Any]


class AlertEvaluationResponse(BaseModel):
    alert_triggered: bool
    reason: str
    incident: IncidentRead | None = None


class ReportSummary(BaseModel):
    users: int
    flows: int
    predictions: int
    incidents: int
    open_incidents: int
    mitigations: int
    active_models: int


class SettingsRead(BaseModel):
    confidence_threshold: float
    packet_rate_threshold: float
    session_timeout_minutes: int
    mitigation_interface: str


class SettingsUpdate(BaseModel):
    confidence_threshold: float | None = Field(default=None, ge=0, le=1)
    packet_rate_threshold: float | None = Field(default=None, ge=0)
    session_timeout_minutes: int | None = Field(default=None, ge=1)
    mitigation_interface: str | None = None

