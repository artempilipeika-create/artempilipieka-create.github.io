"""Bounded carcass plans. Geometry remains owned by the existing constructor."""
import json
from pathlib import Path
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
        if article in ('cam_dowel','confirmat'): return thickness == 18
        if article == '95388': return True
        if article == '134286': return thickness in (16,18)
        return article in ('60714','70245','134762','134763') and thickness in (16,18,25)
    return size in ('4','6','8') and int(size) in GLASS_SUPPORTS.get(article, ())

ShelfValue = Annotated[str, Field(max_length=15)]
class CarcassJoints(StrictModel):
    top: Literal['none','confirmat','cam_dowel']
    bottom: Literal['none','confirmat','cam_dowel']


PLINTH_FEET = {row['article']: row for row in json.loads(
    (Path(__file__).parent/'cabinet_assets/planner/plinth-feet.json').read_text()
)}

ASSETS=Path(__file__).parent/'cabinet_assets/planner'
DECOR_FEET={row['article']:row for row in json.loads((ASSETS/'decor-feet.json').read_text()) if not row.get('issue')}
DECOR_CENTRES=json.loads((ASSETS/'decor-centres.json').read_text())

class WardrobeFeet(StrictModel):
    layout: Literal['width'] | None = Field(default=None,exclude_if=lambda v:v is None)
    article: str
    left: Literal['side'] | None = Field(default=None,exclude_if=lambda v:v is None)
    right: Literal['side'] | None = Field(default=None,exclude_if=lambda v:v is None)

    @model_validator(mode='after')
    def supported(self):
        if self.article not in PLINTH_FEET and ((self.article!='118779' and self.article not in DECOR_FEET) or self.left or self.right):
            raise ValueError('Неизвестная опора или тип цоколя.')
        return self

    @property
    def height(self):
        return (PLINTH_FEET.get(self.article) or DECOR_FEET.get(self.article) or {'height':10})['height']
    front: int = Field(ge=10,le=1200,strict=True)
    rear: int = Field(ge=10,le=1200,strict=True)

def inner_foot_pairs(width, sections, layout):
    if layout == 'width':
        return int(width > 800)
    return sections - 1 or int(width > 900)


class CarcassDesign(CarcassSpec):
    backThickness: Literal[16,18] | None = Field(default=None,exclude_if=lambda v:v is None)
    topFit: Literal['overlay'] | None = Field(default=None,exclude_if=lambda v:v is None)
    bottomFit: Literal['overlay'] | None = Field(default=None,exclude_if=lambda v:v is None)
    feet: WardrobeFeet | None = Field(default=None,exclude_if=lambda v:v is None)
    joints: CarcassJoints | None = Field(default=None,exclude_if=lambda v:v is None)
    dividerSetback: Literal[1] | None = Field(default=None,exclude_if=lambda v:v is None)
    dividerPositions: list[Annotated[int, Field(ge=0,le=2400,strict=True)]] | None = Field(default=None,min_length=1,max_length=2,exclude_if=lambda v:v is None)
    dividerJoints: list[CarcassJoints] | None = Field(default=None,min_length=1,max_length=2,exclude_if=lambda v:v is None)
    shelfChoices: list[Annotated[list[ShelfValue], Field(max_length=10)]] | None = Field(default=None,max_length=3,exclude_if=lambda v:v is None)

    sectionShelves: list[Annotated[int, Field(ge=0, le=10, strict=True)]] | None = Field(default=None, min_length=1, max_length=3)

    @model_validator(mode='after')
    def section_layout(self):
        if self.backThickness and (not self.back or self.recipe not in ('shelves','divided') or (self.backThickness>=16 and self.thickness<16)):
            raise ValueError('Проверьте конструкцию и толщины панелей вкладной задней стенки.')
        if (self.feet or self.topFit or self.bottomFit) and self.recipe not in ('shelves','divided'):
            raise ValueError('Опоры и конструкция панелей задаются для шкафа.')
        if self.feet:
            if self.depth-self.feet.front-self.feet.rear<20:
                raise ValueError('Не помещаются два ряда опор.')
            if self.feet.article in PLINTH_FEET:
                if (self.feet.front<30+self.thickness or self.feet.rear<30 or self.depth-self.feet.front-self.feet.rear<60 or
                    (self.bottomFit and (self.feet.left or self.feet.right))):
                    raise ValueError('Проверьте отступы, дно и примыкания цоколя.')
            elif self.feet.article=='118779' and (self.bottomFit or inner_foot_pairs(self.width,self.sections,self.feet.layout)) and self.thickness<=16:
                raise ValueError('Дно должно быть толще 16 мм для выбранной муфты.')
        if self.joints:
            if self.thickness != 18 or self.recipe not in ('shelves','divided'):
                raise ValueError('Для крепежа нужны вкладные детали 18 мм.')
            if 'cam_dowel' in (self.joints.top,self.joints.bottom) and self.depth < 276:
                raise ValueError('Глубина для эксцентриков со шкантами от 276 мм.')
        if self.dividerSetback is not None and (self.shelfSetback!=1 or self.recipe not in ('shelves','divided')):
            raise ValueError('Отступ полки и внутренней стойки шкафа равен 1 мм.')
        if self.dividerPositions is not None:
            if self.recipe!='divided' or len(self.dividerPositions)!=self.sections-1:
                raise ValueError('Задайте положение каждой внутренней стойки.')
            start=0
            for end in [*self.dividerPositions,self.width-2*self.thickness]:
                if end-start-2*self.shelfGap < 100:
                    raise ValueError('Секция слишком узкая. Измените положение стойки.')
                start=end+self.thickness
        if self.dividerJoints is not None:
            if self.thickness != 18 or self.recipe != 'divided' or len(self.dividerJoints) != self.sections - 1:
                raise ValueError('Проверьте количество и толщину внутренних стоек.')
            if self.depth-(self.backThickness or 0)-(self.dividerSetback or 0) < 216 and any('cam_dowel' in (row.top,row.bottom) for row in self.dividerJoints):
                raise ValueError('Для эксцентрика со шкантом в стойке нужна глубина от 216 мм.')
        if self.shelfChoices is not None:
            if not self.sectionShelves or [len(row) for row in self.shelfChoices] != self.sectionShelves:
                raise ValueError('Проверьте выбор полок по секциям.')
            if any(not shelf_valid(value,self.thickness) for row in self.shelfChoices for value in row):
                raise ValueError('Держатель не подходит к полке.')
            depth = self.depth - self.shelfSetback - (self.backThickness or 0)
            for row in self.shelfChoices:
                if ('board/cam_dowel' in row and depth < 216) or ('board/confirmat' in row and depth < 152):
                    raise ValueError('Для крепежа недостаточно глубины самой полки.')
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
