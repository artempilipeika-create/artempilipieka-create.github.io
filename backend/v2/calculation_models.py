"""Strict trust boundary: input geometry is allowed; request prices/totals are not."""
from decimal import Decimal
from datetime import date,datetime
from typing import Annotated,Literal
from uuid import UUID
from pydantic import Field,BeforeValidator,model_validator
from .auth_api import StrictModel
from .calculation_math import dec

Exact=Annotated[Decimal,BeforeValidator(dec)]
Positive=Annotated[Exact,Field(gt=0,le=100000)]
Reason=Annotated[str,Field(min_length=3,max_length=1000,pattern=r'\S.*\S')]

class CustomerMaterial(StrictModel):
    key: str=Field(min_length=1,max_length=80)
    name: str=Field(min_length=1,max_length=200)
    thickness: Positive
    length: Positive
    width: Positive
    reason: Reason

class EdgeInput(StrictModel):
    edge_id: UUID | None=None
    supply_source: Literal['company','customer']='company'
    selection_mode: Literal['manual','auto']='manual'

class Detail(StrictModel):
    detail_id: str=Field(min_length=1,max_length=100)
    name: str=Field(default='',max_length=200)
    comments: str=Field(default='',max_length=1000)
    draft_row_id: UUID | None=None
    resolution_reason: Reason | None=None
    length: Positive
    width: Positive
    qty: int=Field(strict=True,ge=1,le=5000)
    variant_id: UUID | None=None
    custom_customer: CustomerMaterial | None=None
    supply_source: Literal['company','customer']='company'
    provided_sheets: int | None=Field(default=None,strict=True,ge=1,le=10000)
    customer_reason: Reason | None=None
    rotation: bool=Field(default=False,strict=True)
    grain: Literal['none','length','width','unknown']='unknown'
    route: Literal['solid','glued_18_18']='solid'
    packaging: bool=Field(default=False,strict=True)
    edges: dict[Literal['L1','L2','W1','W2'],EdgeInput]=Field(default_factory=dict)
    @model_validator(mode='after')
    def customer_contract(self):
        if self.custom_customer and (self.variant_id or self.supply_source!='customer'): raise ValueError('Explicit customer ownership required')
        if self.supply_source=='customer' and (not self.provided_sheets or not self.customer_reason): raise ValueError('Customer parameters required')
        if self.draft_row_id and not self.resolution_reason: raise ValueError('Raw row correction needs a reason')
        return self

class RevisionRequest(StrictModel):
    parent_revision_id: UUID | None=None
    catalogue_release_id: UUID | None=None
    production_profile_id: UUID | None=None
    reason: Reason
    comment: str=Field(default='',max_length=4000)
    details: list[Detail] | None=Field(default=None,max_length=1000)

class SubmitRequest(StrictModel):
    revision_id: UUID | None=None
    preliminary_calculation_id: UUID | None=None
    comment: str=Field(default='',max_length=4000)
    handoff_problematic: bool=Field(default=False,strict=True)

class CalculationRequest(StrictModel):
    revision_id: UUID

class RecalculateRequest(StrictModel):
    reason: Reason

class ReasonRequest(StrictModel):
    reason: Reason

class GeometrySettings(StrictModel):
    kerf_mm: Positive
    trim_left_mm: Annotated[Exact,Field(ge=0,le=1000)]
    trim_right_mm: Annotated[Exact,Field(ge=0,le=1000)]
    trim_top_mm: Annotated[Exact,Field(ge=0,le=1000)]
    trim_bottom_mm: Annotated[Exact,Field(ge=0,le=1000)]
    glue_layers: Literal[2]
    glue_allowance_each_side_mm: Positive
    glued_finished_thickness_mm: Positive
    complex_edge_threshold_mm: Positive
    geometry_decimal_places: int=Field(strict=True,ge=0,le=6)

class EdgeConsumption(StrictModel):
    basis: Literal['net','factor_ceil']
    factor: Positive | None=None
    step_m: Positive | None=None
    @model_validator(mode='after')
    def rule(self):
        if self.basis=='factor_ceil' and (self.factor is None or self.step_m is None): raise ValueError('Factor and step required')
        return self

class CutScope(StrictModel):
    basis: Literal['estimated_plan_excluding_trim']
    families: list[str]=Field(min_length=1,max_length=30)
    include_glue_blanks: bool=Field(strict=True)

class EdgeClass(StrictModel):
    thick: bool=Field(strict=True)
    complex_overlap: Literal['edge_thick','edge_complex'] | None=None

class Policies(StrictModel):
    edge_consumption: EdgeConsumption | None=None
    cutting_18: CutScope | None=None
    glue_area: Literal['finished_area','one_blank_area'] | None=None
    edge_classification: dict[UUID,EdgeClass] | None=None

class VersionMetadata(StrictModel):
    supersedes: UUID | None=None
    source: str=Field(min_length=3,max_length=1000)
    source_date: date
    reason: Reason
    synthetic: bool=False

class ProductionProfile(VersionMetadata):
    settings: GeometrySettings
    policies: Policies

class Tariff(StrictModel):
    operation: Literal['cutting_18','glued_finish_cut','edge_normal','edge_complex','edge_thick','glue','packaging']
    amount: Annotated[Exact,Field(ge=0,le=100000)]
    currency: Literal['BYN']
    tax_convention: str | None=Field(default=None,max_length=200)

class TariffBook(VersionMetadata):
    effective_from: datetime
    effective_to: datetime | None=None
    entries: list[Tariff]=Field(min_length=1,max_length=7)

class SalePrice(StrictModel):
    item_id: UUID
    kind: Literal['material','edge']
    amount: Annotated[Exact,Field(ge=0,le=10000000)]
    unit: Literal['sheet','m2','m']
    free_basis: Reason | None=None
    raw_price_entry_id: UUID | None=None
    @model_validator(mode='after')
    def basis(self):
        if self.amount==0 and not self.free_basis: raise ValueError('Approved free basis required')
        if (self.kind=='edge' and self.unit!='m') or (self.kind=='material' and self.unit=='m'): raise ValueError('Wrong unit')
        return self

class PriceBook(VersionMetadata):
    release_id: UUID
    currency: Literal['BYN']
    tax_convention: str=Field(min_length=1,max_length=200)
    effective_from: datetime
    effective_to: datetime | None=None
    entries: list[SalePrice]=Field(min_length=1,max_length=5000)

class DiscountProfile(VersionMetadata):
    materials: Annotated[Exact,Field(ge=0,le=100)]
    edge_material: Annotated[Exact,Field(ge=0,le=100)]
    services: Annotated[Exact,Field(ge=0,le=100)]

class Defaults(StrictModel):
    production_profile_id: UUID
    tariff_book_id: UUID
    price_book_id: UUID | None
    discount_profile_id: UUID | None
    expected_version: int=Field(strict=True,ge=1)
    reason: Reason

class DiscountAssignment(StrictModel):
    profile_id: UUID
    reason: Reason

class OrderContext(StrictModel):
    production_profile_id: UUID
    tariff_book_id: UUID
    price_book_id: UUID | None
    discount_profile_id: UUID | None
    reason: Reason
