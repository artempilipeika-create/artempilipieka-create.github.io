"""Measured room envelope and survey, saved with the project; no production geometry."""
from typing import Literal
from pydantic import Field, model_validator
from .auth_api import StrictModel

class RoomFeature(StrictModel):
    id: str=Field(min_length=1,max_length=80)
    kind: Literal['window','door','socket','switch','water','sewer','gas','ventilation','meter','radiator','column']
    wall: Literal['a','b','c','d']
    label: str=Field(default='',max_length=100)
    offset: int=Field(ge=0,le=12000)
    elevation: int=Field(ge=0,le=5000)
    width: int=Field(ge=1,le=12000)
    height: int=Field(ge=1,le=5000)
    projection: int=Field(default=0,ge=0,le=3000)
    notes: str=Field(default='',max_length=500)

class Room(StrictModel):
    width: int=Field(default=4200,ge=1500,le=12000)
    depth: int=Field(default=3200,ge=1500,le=12000)
    height: int=Field(default=2700,ge=2000,le=5000)
    # None identifies earlier projects and does not assert that a survey took place.
    setup_complete: bool|None=None
    survey: Literal['none','present']|None=None
    features: list[RoomFeature]=Field(default_factory=list,max_length=100)

    @model_validator(mode='after')
    def measured_envelope(self):
        ids=set()
        for f in self.features:
            if f.id in ids:raise ValueError('Duplicate room feature id')
            ids.add(f.id)
            span=self.width if f.wall in ('a','c') else self.depth
            cross=self.depth if f.wall in ('a','c') else self.width
            if f.offset+f.width>span or f.elevation+f.height>self.height or f.projection>cross:
                raise ValueError('Room feature outside measured envelope')
            if f.kind=='door' and f.elevation!=0:raise ValueError('Door must start at floor')
        # Dimensions are sufficient to start; retain explicit surveys in existing projects.
        if self.setup_complete and self.survey is not None:
            if (self.survey=='present')!=bool(self.features):raise ValueError('Room survey and features disagree')
        return self
