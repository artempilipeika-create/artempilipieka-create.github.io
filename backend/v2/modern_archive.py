"""Build the downloadable package from the exact checked-in native sources."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT=Path(__file__).parent/'cabinet_assets'/'planner'
def build_archive(root=ROOT):
    variants=json.loads((root/'modern-cabinet-variants.json').read_text())
    target=root/'modern-cabinet-sources.zip'
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
        for variant in variants:
            source=root/'modern-cabinet-sources'/variant['source_file']
            assert hashlib.sha256(source.read_bytes()).hexdigest()==variant['source_sha256']
            archive.write(source,'Модули Martin Forest/'+source.name)
        archive.write(root/'bazis-drawers-import.js','Martin_Forest_Import_v9_9_16.js')
        archive.writestr('Инструкция.txt',READ_ME)
    return target

READ_ME='Новые модули Martin Forest.\n1. Скопируйте папку Модули Martin Forest в вашу общую библиотеку FR3D.\n2. Скачайте экспорт проекта с сайта и запустите Martin_Forest_Import_v9_9_16.js в БАЗИС.\n3. Укажите общую родительскую папку библиотеки: поиск включает вложенные папки.\n4. Вариант газлифтов без ручек имеет исходник 720 мм; импортёр эластично перестраивает его до выбранных на сайте 450 мм. После импорта проверьте ход фасада и крепления.\nНе переименовывайте и не изменяйте исходники: импорт проверяет их SHA-256.\n'
if __name__=='__main__':build_archive()
