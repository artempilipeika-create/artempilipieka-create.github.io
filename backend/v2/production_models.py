"""Bounded v2 protocol messages. Unknown properties are rejected, never trusted."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field
from .auth_api import StrictModel
from .calculation_models import Reason, Positive

class JobRequest(StrictModel):
    revision_id: UUID
    calculation_id: UUID
    purpose: Literal['calculate','produce']
    export_profile_version: str=Field(default='mf-oblx-preview-v1',max_length=100)
    final_candidate_id: UUID | None=None
    reason: Reason

class Capabilities(StrictModel):
    capabilities: list[str]=Field(min_length=1,max_length=30)

class Pull(Capabilities):
    purpose: Literal['calculate','produce']

class Event(StrictModel):
    event_id: UUID
    run_id: UUID
    type: Literal['started','progress','native_imported','calculation_completed','physical_started','result_ready','failed','cancelled','uncertain']
    occurred_at: datetime
    payload_hash: str=Field(pattern='^[a-f0-9]{64}$')
    progress_percent: int | None=Field(default=None,strict=True,ge=0,le=100)
    code: str | None=Field(default=None,max_length=80,pattern='^[A-Z0-9_]+$')

class ResultArtifact(StrictModel):
    artifact_id: UUID
    kind: Literal['returned_oblx','result_summary','cutting_output','job_log','native_export']
    sha256: str=Field(pattern='^[a-f0-9]{64}$')
    size_bytes: int=Field(strict=True,ge=1,le=1024*1024)
    content_base64: str=Field(max_length=1400000)

class Result(StrictModel):
    result_id: UUID
    run_id: UUID
    order_id: str=Field(max_length=80)
    revision_id: UUID
    calculation_id: UUID
    job_id: UUID
    input_manifest_hash: str=Field(pattern='^[a-f0-9]{64}$')
    bazis_version: str=Field(min_length=1,max_length=100)
    started_at: datetime
    completed_at: datetime
    status: Literal['succeeded','failed']
    execution: Literal['fake','native']
    artifacts: list[ResultArtifact]=Field(min_length=1,max_length=16)
    native_signature: str | None=Field(default=None,max_length=128)

class Reconciliation(StrictModel):
    run_id: UUID
    decision: Literal['confirmed_not_executed','confirmed_stopped','retain_uncertain']
    evidence_file_ids: list[UUID]=Field(min_length=1,max_length=10)
    reason: Reason

class FinalApproval(StrictModel):
    candidate_id: UUID
    revision_id: UUID
    reason: Reason

class OrderApproval(StrictModel):
    # Nullable solely to preserve the old machine gate on an empty request.
    candidate_id: UUID | None=None
    revision_id: UUID | None=None
    reason: Reason | None=None
