"""Bundle the pinned AKS hardware and the importer used by the constructor."""
from base64 import b64decode
from binascii import Error as Base64Error
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from .assistant_model import DOOR_HARDWARE, ROD_CATALOGUE

ROOT = Path(__file__).parent
IMPORTER_VERSION = '9.9.45'
_version_tag = IMPORTER_VERSION.replace('.', '_')
KIT_NAME = f'Martin_Forest_AKS_19mm_v{_version_tag}.zip'
IMPORTER_NAME = f'Martin_Forest_Import_v{_version_tag}.js'


def private_rod_sources():
    """Original workshop FR3Ds are provisioned on the server, outside the public repository."""
    result = {}
    for article, product in ROD_CATALOGUE.items():
        data = os.environ.get(f'MF_WARDROBE_ROD_{article}_FR3D')
        if data is None:
            continue
        try:
            source = b64decode(data, validate=True)
        except (ValueError, Base64Error) as exc:
            raise ValueError(f'Не прочитан исходник штанги {article}.') from exc
        if sha256(source).hexdigest() != product['sha']:
            raise ValueError(f'Проверьте исходник штанги {article}.')
        result[product['file']] = source
    if result and len(result) != len(ROD_CATALOGUE):
        raise ValueError('Комплект исходных штанг неполон.')
    return result


def private_handle_sources(required):
    result = {}
    for article, product in DOOR_HARDWARE.items():
        data = os.environ.get(f'MF_WARDROBE_HANDLE_{article}_FR3D')
        if not data:
            if required:
                raise ValueError(f'Не установлен исходный фрагмент ручки или профиля {article}.')
            continue
        try:
            source = b64decode(data, validate=True)
        except (ValueError, Base64Error) as exc:
            raise ValueError(f'Не прочитан исходник {article}.') from exc
        if sha256(source).hexdigest() != product['sha']:
            raise ValueError(f'Проверьте исходный фрагмент {article}.')
        result[product['file']] = source
    return result


@lru_cache(maxsize=4)
def kit_bytes(rods_required=False, handles_required=False):
    rods = private_rod_sources()
    if rods_required and not rods:
        raise ValueError('Исходные штанги ещё не установлены на сервере.')
    handles = private_handle_sources(handles_required)
    sources = ROOT / 'wardrobe-aks'
    result = BytesIO((sources / 'MF_AKS_wardrobe.zip').read_bytes())
    with ZipFile(result, 'a') as archive:
        def add(name, data):
            entry = ZipInfo(name)
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
        with ZipFile(sources/'MF_Z1.zip') as frames:
            for name in frames.namelist():
                add('Martin Forest AKS/' + name, frames.read(name))
        for source in sorted(sources.glob('*.fr3d')):
            add('Martin Forest AKS/' + source.name, source.read_bytes())
        for name, data in {**rods, **handles}.items():
            add('Martin Forest AKS/' + name, data)
        add(IMPORTER_NAME, (ROOT / 'cabinet_assets/planner/bazis-drawers-import.js').read_bytes())
    return result.getvalue()
