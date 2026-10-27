"""Private, persistent receipts. A request ID can contact the provider only once.

The exclusive receipt directory also works across processes. An interrupted
request remains uncertain; checking it never retries a potentially paid call.
"""
import hashlib
import json
import time
from pathlib import Path
from uuid import UUID


def location(root, owner, project, request_id):
    account = hashlib.sha256(str(owner).encode()).hexdigest()
    return Path(root) / 'kitchen-renders' / account / str(UUID(str(project))) / str(UUID(str(request_id)))


def read(root, owner, project, request_id):
    path = location(root, owner, project, request_id)
    if not path.exists():
        return None
    receipt = path / 'request.json'
    metadata = json.loads(receipt.read_text(encoding='utf-8')) if receipt.exists() else {}
    public = {'render_style': metadata.get('render_style', 'catalog')}
    if 'version' in metadata:
        public['version'] = metadata['version']
    result = path / 'result.json'
    if result.exists():
        return {**public, **json.loads(result.read_text(encoding='utf-8'))}
    if time.time() - path.stat().st_mtime > 240:
        return {**public, 'state': 'uncertain', 'message': 'Ответ сервиса не сохранён. Автоматического повтора не будет. Проверьте расход перед новой генерацией.'}
    return {**public, 'state': 'pending'}


def once(root, owner, project, request_id, version, preview, generate, render_style='catalog'):
    if render_style not in ('catalog', 'lived_in'):
        raise ValueError('Неизвестный стиль фоторендера')
    path = location(root, owner, project, request_id)
    # Retain the original signature for existing catalogue receipts.
    style_signature = '\nrender_style=' + render_style if render_style != 'catalog' else ''
    signature = hashlib.sha256((str(version) + '\n' + preview + style_signature).encode()).hexdigest()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.mkdir()
    except FileExistsError:
        receipt = path / 'request.json'
        if receipt.exists() and json.loads(receipt.read_text(encoding='utf-8'))['signature'] != signature:
            raise ValueError('Этот запуск относится к другому виду проекта. Откройте альбом заново.')
        return read(root, owner, project, request_id)
    # Claim before contacting the provider. Do not delete receipts on failure.
    receipt = {'signature': signature, 'version': version, 'render_style': render_style}
    request_temp = path / 'request.tmp'
    request_temp.write_text(json.dumps(receipt), encoding='utf-8')
    request_temp.replace(path / 'request.json')
    try:
        result = {'state': 'ready', 'image_data_url': generate(), 'version': version}
    except ValueError as exc:
        result = {'state': 'failed', 'message': str(exc), 'version': version}
    except Exception:
        result = {'state': 'uncertain', 'message': 'Ответ сервиса не сохранён. Автоматического повтора не будет. Проверьте расход перед новой генерацией.', 'version': version}
    result['render_style'] = render_style
    temporary = path / 'result.tmp'
    temporary.write_text(json.dumps(result), encoding='utf-8')
    temporary.replace(path / 'result.json')
    return result
