"""Bundle the pinned AKS hardware and the importer used by the constructor."""
from base64 import b64decode
from binascii import Error as Base64Error
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from .assistant_model import ROD_CATALOGUE

ROOT = Path(__file__).parent
KIT_NAME = 'Martin_Forest_AKS_19mm_v9_9_32.zip'
IMPORTER_NAME = 'Martin_Forest_Import_v9_9_32.js'


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


@lru_cache(maxsize=2)
def kit_bytes(rods_required=False):
    rods = private_rod_sources()
    if rods_required and not rods:
        raise ValueError('Исходные штанги ещё не установлены на сервере.')
    sources = ROOT / 'wardrobe-aks'
    result = BytesIO((sources / 'MF_AKS_wardrobe.zip').read_bytes())
    with ZipFile(result, 'a') as archive:
        def add(name, data):
            entry = ZipInfo(name)
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
        for source in sorted(sources.glob('*.fr3d')):
            add('Martin Forest AKS/' + source.name, source.read_bytes())
        for name, data in rods.items():
            add('Martin Forest AKS/' + name, data)
        add(IMPORTER_NAME, (ROOT / 'cabinet_assets/planner/bazis-drawers-import.js').read_bytes())
    return result.getvalue()
