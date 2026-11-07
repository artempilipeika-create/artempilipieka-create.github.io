"""Independent board contract: new shapes must not relax existing cabinet validation."""
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem, Scene


def board(**patch):
    values = dict(
        item_id="blank-1", module_type="blank", name="Заготовка ЛДСП",
        width=720, height=18, depth=400, x=0, z=0, rotation=0,
        base="wall", base_height=0, body_height=18, worktop_thickness=0,
        layout="doors", drawers=0, handles="handleless",
        blank_length_mm=720, blank_width_mm=400, blank_thickness_mm=18,
        blank_axis="horizontal", blank_edge_code="1010"
    )
    values.update(patch)
    return values


def test_board_roundtrip_in_scene():
    scene = Scene(items=[FurnitureItem.model_validate(board(blank_edge_thickness_mm=2))],
                  module_type="blank", width=720, height=18, depth=400)
    saved = scene.model_dump(mode="json")
    opened = Scene.model_validate(saved)
    item = opened.items[0]
    assert (item.blank_length_mm, item.blank_width_mm, item.blank_thickness_mm) == (720, 400, 18)
    assert item.blank_edge_code == "1010"
    assert item.module_type == "blank"
    assert item.blank_edge_thickness_mm == 2


def test_board_rotation_and_elevation():
    item = FurnitureItem.model_validate(board(width=18, height=720, depth=400,
         body_height=720, blank_axis="side", elevation_mm=600))
    assert item.elevation_mm == 600
    assert item.height == 720


@pytest.mark.parametrize("patch", [
    {"blank_edge_thickness_mm": 0},
    {"blank_edge_thickness_mm": float("nan")},
    {"blank_edge_code": "1200"},
    {"blank_edge_code": "11"},
    {"blank_length_mm": 99},
    {"width": 719},
    {"blank_axis": "unknown"},
    {"base": "plinth"},
    {"worktop_thickness": 38},
    {"drawers": 2}
])
def test_bad_board_is_rejected(patch):
    with pytest.raises(ValidationError):
        FurnitureItem.model_validate(board(**patch))


def test_old_cabinets_retain_original_minimum_dimensions():
    values = board(module_type="base_cabinet", width=149, height=820, depth=560,
                   base="plinth", base_height=100, body_height=720,
                   blank_length_mm=None, blank_width_mm=None, blank_thickness_mm=None,
                   blank_axis=None, blank_edge_code=None)
    with pytest.raises(ValidationError):
        FurnitureItem.model_validate(values)
