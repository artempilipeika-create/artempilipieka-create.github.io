"""Bounded carcass plans. Geometry remains owned by the existing constructor."""
from typing import Literal, Annotated
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


# Keys correspond to the shelf fragments available in the questionnaire.
GLASS_SUPPORTS = {
    **dict.fromkeys(('39543','48862','39544','48846','48848'), (4,6,8)),
    **dict.fromkeys(('80936','103819','103816','103817','103814'), (6,8)),
    **dict.fromkeys(('64145','103818'), (8,)),
}
def shelf_valid(value, thickness):
    size, sep, article = value.partition('/')
    if size == 'board':
        if article == '95388': return True
        if article == '134286': return thickness in (16,18)
        return article in ('60714','70245','134762','134763') and thickness in (16,18,25)
    return size in ('4','6','8') and int(size) in GLASS_SUPPORTS.get(article, ())

ShelfValue = Annotated[str, Field(max_length=15)]
class CarcassDesign(CarcassSpec):
    shelfChoices: list[Annotated[list[ShelfValue], Field(max_length=10)]] | None = Field(default=None,max_length=3,exclude_if=lambda v:v is None)

    sectionShelves: list[Annotated[int, Field(ge=0, le=10, strict=True)]] | None = Field(default=None, min_length=1, max_length=3)

    @model_validator(mode='after')
    def section_layout(self):
        if self.shelfChoices is not None:
            if not self.sectionShelves or [len(row) for row in self.shelfChoices] != self.sectionShelves:
                raise ValueError('Проверьте выбор полок по секциям.')
            if any(not shelf_valid(value,self.thickness) for row in self.shelfChoices for value in row):
                raise ValueError('Держатель не подходит к полке.')
        if self.sectionShelves is not None:
            if self.recipe not in ('shelves', 'divided') or len(self.sectionShelves) != self.sections or max(self.sectionShelves) != self.shelves:
                raise ValueError('Invalid section layout')
        return self


class AssistantCarcass(StrictModel):
    group_id: UUID
    spec: CarcassDesign
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
