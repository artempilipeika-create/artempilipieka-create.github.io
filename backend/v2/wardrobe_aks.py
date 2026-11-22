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

from .assistant_model import DOOR_HARDWARE, LIGHTING, ROD_CATALOGUE, WARDROBE_FITTINGS, Z1_DATA

ROOT = Path(__file__).parent
IMPORTER_VERSION = '9.9.52'
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
        if product.get('model'):
            continue
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


def private_lira_sources(required):
    sources = {}
    for stock in (*LIGHTING['lira-1708']['profile']['stock'], *LIGHTING['lira-17.5x6.5']['profile']['stock']):
        article = stock['article']
        encoded = os.environ.get(f'MF_WARDROBE_LIRA_{article}_FR3D')
        if not encoded:
            if required:
                raise ValueError(f'Не установлен исходный профиль LIRA {article}.')
            continue
        try:
            source = b64decode(encoded, validate=True)
        except (ValueError, Base64Error) as exc:
            raise ValueError(f'Не прочитан профиль LIRA {article}.') from exc
        if sha256(source).hexdigest() != stock['sha']:
            raise ValueError(f'Не подтверждён исходник профиля LIRA {article}.')
        sources[stock['file']] = source
    return sources


def private_z1_sources(required):
    key = os.environ.get('MF_WARDROBE_BLUM_PARTS_KEY')
    if not key:
        if required:
            raise ValueError('Исходные фрагменты витрины Z1 ещё не установлены на сервере.')
        return {}
    archive = (ROOT / 'wardrobe-aks' / 'MF_Z1.enc').read_bytes()
    try:
        plaintext = AESGCM(bytes.fromhex(key)).decrypt(archive[:12], archive[12:], b'Martin Forest Blum components v1')
    except (InvalidTag, ValueError) as exc:
        raise ValueError('Не удалось открыть исходные фрагменты витрины Z1.') from exc
    products = [Z1_DATA['front'], *Z1_DATA['hinges'], *Z1_DATA['boardHinges'], *Z1_DATA['plates']]
    with ZipFile(BytesIO(plaintext)) as bundle:
        if sorted(bundle.namelist()) != sorted(row['source_file'] for row in products):
            raise ValueError('Неполный комплект витрины Z1.')
        sources = {row['source_file']: bundle.read(row['source_file']) for row in products}
    for row in products:
        if sha256(sources[row['source_file']]).hexdigest() != row['sha256']:
            raise ValueError('Не подтверждён исходный файл ' + row['source_file'])
    return sources


def private_fitting_sources(required):
    products = {row['file']: row['sha'] for row in WARDROBE_FITTINGS.values()}
    return private_aks_sources(required, 'MF_AKS_wardrobe_fittings.enc', b'Martin Forest AKS wardrobe fittings v1', products, 'наполнения')


def private_surface_sources(required):
    products = {row['file']: row['sha'] for row in DOOR_HARDWARE.values() if row.get('model')}
    return private_aks_sources(required, 'MF_AKS_surface_pulls.enc', b'Martin Forest AKS surface pulls v1', products, 'ручек')


def private_aks_sources(required, filename, associated_data, products, label):
    key = os.environ.get('MF_WARDROBE_SURFACE_PULLS_KEY')
    if not key:
        if required:
            raise ValueError('На сервере отсутствует комплект '+label+' АКС.')
        return {}
    archive = (ROOT / 'wardrobe-aks' / filename).read_bytes()
    try:
        plaintext = AESGCM(bytes.fromhex(key)).decrypt(archive[:12], archive[12:], associated_data)
    except (InvalidTag, ValueError) as exc:
        raise ValueError('Не удалось открыть комплект '+label+' АКС.') from exc
    with ZipFile(BytesIO(plaintext)) as bundle:
        if sorted(bundle.namelist()) != sorted(products):
            raise ValueError('Комплект '+label+' АКС неполон.')
        sources = {name: bundle.read(name) for name in products}
    for name, digest in products.items():
        if sha256(sources[name]).hexdigest() != digest:
            raise ValueError('Не подтверждён исходный файл ' + name)
    return sources


@lru_cache(maxsize=32)
def kit_bytes(rods_required=False, handles_required=False, z1_required=False, lira_required=False, pulls_required=False, fittings_required=False):
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
        for name, data in {**rods, **handles, **private_surface_sources(pulls_required), **private_fitting_sources(fittings_required), **private_z1_sources(z1_required), **private_lira_sources(lira_required)}.items():
            add('Martin Forest AKS/' + name, data)
        add(IMPORTER_NAME, (ROOT / 'cabinet_assets/planner/bazis-drawers-import.js').read_bytes())
    return result.getvalue()
