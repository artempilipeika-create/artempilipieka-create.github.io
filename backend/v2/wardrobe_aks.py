"""Bundle the pinned AKS hardware and the importer used by the constructor."""
from base64 import b64decode
from binascii import Error as Base64Error
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .assistant_model import DOOR_HARDWARE, ROD_CATALOGUE, Z1_DATA

ROOT = Path(__file__).parent
IMPORTER_VERSION = '9.9.46'
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


def private_z1_sources(required):
    key = os.environ.get('MF_WARDROBE_Z1_KEY')
    if not key:
        if required:
            raise ValueError('Исходные фрагменты витрины Z1 ещё не установлены на сервере.')
        return {}
    archive = (ROOT / 'wardrobe-aks' / 'MF_Z1.enc').read_bytes()
    try:
        plaintext = AESGCM(bytes.fromhex(key)).decrypt(archive[:12], archive[12:], b'Martin Forest Z1 archive v1')
    except (InvalidTag, ValueError) as exc:
        raise ValueError('Не удалось открыть исходные фрагменты витрины Z1.') from exc
    products = [Z1_DATA['front'], *Z1_DATA['hinges']]
    with ZipFile(BytesIO(plaintext)) as bundle:
        if sorted(bundle.namelist()) != sorted(row['source_file'] for row in products):
            raise ValueError('Неполный комплект витрины Z1.')
        sources = {row['source_file']: bundle.read(row['source_file']) for row in products}
    for row in products:
        if sha256(sources[row['source_file']]).hexdigest() != row['sha256']:
            raise ValueError('Не подтверждён исходный файл ' + row['source_file'])
    return sources


@lru_cache(maxsize=8)
def kit_bytes(rods_required=False, handles_required=False, z1_required=False):
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
        for source in sorted(sources.glob('*.fr3d')):
            add('Martin Forest AKS/' + source.name, source.read_bytes())
        for name, data in {**rods, **handles, **private_z1_sources(z1_required)}.items():
            add('Martin Forest AKS/' + name, data)
        add(IMPORTER_NAME, (ROOT / 'cabinet_assets/planner/bazis-drawers-import.js').read_bytes())
    return result.getvalue()
