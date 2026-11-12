"""Bounded carcass plans. Geometry remains owned by the existing constructor."""
from typing import Literal
from uuid import UUID
from pydantic import Field, model_validator
from .auth_api import StrictModel


class CarcassSpec(StrictModel):
    recipe: Literal['shelves', 'divided', 'wall', 'base', 'sink', 'cap']
    width: int = Field(ge=200, le=2400, strict=True)
    height: int = Field(ge=200, le=3000, strict=True)
    depth: int = Field(ge=200, le=1200, strict=True)
    thickness: int = Field(ge=10, le=40, strict=True)
    shelves: int = Field(ge=0, le=10, strict=True)
    sections: int = Field(ge=1, le=3, strict=True)
    back: bool
    elevation: int = Field(ge=0, le=5000, strict=True)
    shelfSetback: int = Field(ge=0, le=100, strict=True)
    shelfGap: int = Field(ge=0, le=10, strict=True)
    edgeThickness: Literal[0.4, 0.8, 1, 2, 3]
    edgePolicy: Literal['front', 'all', 'none']

    @model_validator(mode='after')
    def construction(self):
        if self.recipe == 'sink' and (self.back or self.shelves or self.sections != 1):
            raise ValueError('Invalid sink construction')
        if self.recipe in ('base', 'cap') and self.sections != 1:
            raise ValueError('Single section required')
        if (self.width-(self.sections+1)*self.thickness)//self.sections-2*self.shelfGap < 100:
            raise ValueError('Sections too narrow')
        top = self.height-(80 if self.recipe == 'sink' else self.thickness)
        if top-self.thickness-self.shelves*self.thickness < (self.shelves+1)*60:
            raise ValueError('Shelves too close')
        return self


class CarcassPosition(StrictModel):
    x: float = Field(ge=-12000, le=12000, multiple_of=0.5, allow_inf_nan=False)
    z: float = Field(ge=-12000, le=12000, multiple_of=0.5, allow_inf_nan=False)
    elevation_mm: int = Field(ge=0, le=5000, strict=True)
    rotation: Literal[0, 90, 180, 270]


class AssistantCarcass(StrictModel):
    group_id: UUID
    spec: CarcassSpec
    position: CarcassPosition


class AssistantPlan(StrictModel):
    action: Literal['create', 'update', 'clarify']
    message: str = Field(min_length=1, max_length=1200)
    spec: CarcassSpec | None

    @model_validator(mode='after')
    def complete(self):
        if (self.action == 'clarify') != (self.spec is None):
            raise ValueError('Incomplete plan')
        return self
