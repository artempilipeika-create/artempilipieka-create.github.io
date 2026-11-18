"""Bundle the pinned AKS hardware and the importer used by the constructor."""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).parent
KIT_NAME = 'Martin_Forest_AKS_19mm_v9_9_31.zip'
IMPORTER_NAME = 'Martin_Forest_Import_v9_9_31.js'


@lru_cache(maxsize=1)
def kit_bytes():
    sources = ROOT / 'wardrobe-aks'
    result = BytesIO((sources / 'MF_AKS_wardrobe.zip').read_bytes())
    with ZipFile(result, 'a') as archive:
        def add(name, path):
            entry = ZipInfo(name)
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes())
        for source in sorted(sources.glob('*.fr3d')):
            add('Martin Forest AKS/' + source.name, source)
        add(IMPORTER_NAME, ROOT / 'cabinet_assets/planner/bazis-drawers-import.js')
    return result.getvalue()
