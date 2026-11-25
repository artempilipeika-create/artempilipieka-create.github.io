"""Verified supplier thumbnails used only for their own article numbers."""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

ARCHIVE = Path(__file__).with_name('estimate_data') / 'photographs.zip'
PREFIX = 'estimate-photos/'


@lru_cache(maxsize=1)
def names():
    with ZipFile(ARCHIVE) as images:
        return frozenset(PREFIX+name for name in images.namelist())


def image_bytes(asset):
    if asset not in names():
        return None
    with ZipFile(ARCHIVE) as images:
        return images.read(asset.removeprefix(PREFIX))


def pdf_image(assets, asset):
    if not asset or '://' in asset:
        return None
    if asset.startswith(PREFIX):
        data=image_bytes(asset)
        return BytesIO(data) if data else None
    path=(assets / asset).resolve()
    return path if path.is_relative_to(assets.resolve()) and path.is_file() else None
