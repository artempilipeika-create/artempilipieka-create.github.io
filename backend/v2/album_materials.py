"""Small PDF samples from the same verified local assets as the constructor."""
from functools import lru_cache
from io import BytesIO
import hashlib
import re
import warnings
from zipfile import BadZipFile

from PIL import Image, ImageOps

from . import material_visuals


@lru_cache(maxsize=64)
def thumbnail(url):
    # Catalogue metadata is data, not a filesystem path or a URL to fetch.
    match = re.fullmatch(r'/account/planner/materials/([\w.-]+\.(?:jpg|jpeg|png|webp))', str(url))
    if not match:
        return None
    asset = match[1]
    if '..' in asset:
        return None
    records = {r['asset']: r for r in material_visuals.manifest()['decors'].values()}
    record = records.get(asset)
    user = material_visuals.user_textures()['assets'].get(asset)
    if not record and not user:
        return None
    try:
        data = (material_visuals.user_texture_bytes(asset) if user else
                (material_visuals.ROOT / asset).read_bytes())
        if not data or len(data) > 16_000_000:
            return None
        if hashlib.sha256(data).hexdigest() != (user or record)['sha256']:
            return None
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.width * source.height > 32_000_000:
                    return None
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((320, 320))
                out = BytesIO()
                image.save(out, 'JPEG', quality=92)
                return out.getvalue()
    except (OSError, ValueError, KeyError, BadZipFile,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        return None


def sample(visual=None):
    visual = visual or {}
    for key, label in [('texture_url', 'Текстура материала'),
                       ('preview_url', 'Образец, без текстуры')]:
        data = thumbnail(visual.get(key))
        if data:
            return {'image': data, 'color': None, 'label': label}
    color = visual.get('render_color')
    if re.fullmatch(r'#[\da-fA-F]{6}', str(color)):
        return {'image': None, 'color': color, 'label': 'Цвет, без текстуры'}
    return {'image': None, 'color': None, 'label': 'Текстура не добавлена'}
