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
    if time.time() - path.stat().st_mtime > 420:
        return {**public, 'state': 'uncertain', 'message': 'Ответ сервиса не сохранён. Автоматического повтора не будет. Проверьте расход перед новой генерацией.'}
    return {**public, 'state': 'pending'}


def once(root, owner, project, request_id, version, preview, generate, render_style='catalog', scene_key=None):
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
    if scene_key:
        receipt['scene_key'] = scene_key
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


def scene_key(scene):
    """Saving, selecting a cabinet or switching editor view must not cost money."""
    scene = {k: v for k, v in scene.items() if k not in ('selected_item_id', 'view_mode', 'albumSettings', 'upperMountingRule')}
    return hashlib.sha256(json.dumps(scene, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def _project_path(root, owner, project):
    return location(root, owner, project, UUID(int=0)).parent


def _index_result(root, owner, project, index):
    reference = index / 'reference.json'
    if reference.exists():
        request_id = json.loads(reference.read_text())['request_id']
        receipt = location(root, owner, project, request_id) / 'request.json'
        if receipt.exists():
            metadata = json.loads(receipt.read_text())
            if metadata.get('scene_key') and metadata['scene_key'] != index.name:
                return {'state': 'uncertain', 'message': 'Этот запуск относится к другой кухне. Повторный платный запрос заблокирован.'}
        result = read(root, owner, project, request_id)
        if result is not None:
            return {**result, 'request_id': request_id}
    if time.time() - index.stat().st_mtime > 420:
        return {'state': 'uncertain', 'message': 'Результат запуска пока недоступен. Новая платная генерация заблокирована, чтобы не списать средства повторно.'}
    return {'state': 'pending'}


def current(root, owner, project, scene, version, preview=None):
    """Recover the same image across tabs/saves, including verifiable old receipts."""
    folder = _project_path(root, owner, project)
    key = scene_key(scene)
    index = folder / 'scenes' / key
    if index.exists():
        return _index_result(root, owner, project, index)
    if not folder.exists():
        return None
    matches = []
    for path in folder.iterdir():
        try:
            request_id = str(UUID(path.name))
        except ValueError:
            continue
        receipt = path / 'request.json'
        if not receipt.exists():
            continue
        metadata = json.loads(receipt.read_text())
        matches_scene = metadata.get('scene_key') == key
        if not metadata.get('scene_key'):
            # Older versions stored only version + preview signature. Never guess
            # from just the project ID when its kitchen may have changed.
            matches_scene = metadata.get('version') == version
            if preview and not matches_scene:
                style = metadata.get('render_style', 'catalog')
                suffix = '\nrender_style=' + style if style != 'catalog' else ''
                signature = hashlib.sha256((str(metadata.get('version')) + '\n' + preview + suffix).encode()).hexdigest()
                matches_scene = metadata.get('signature') == signature
        if matches_scene:
            result = read(root, owner, project, request_id)
            matches.append((result.get('state') == 'ready', path.stat().st_mtime, request_id))
    if not matches:
        return None
    request_id = max(matches)[2]
    _claim(index, request_id)
    return _index_result(root, owner, project, index)


def _claim(index, request_id):
    index.parent.mkdir(parents=True, exist_ok=True)
    try:
        index.mkdir()
    except FileExistsError:
        return False
    temporary = index / 'reference.tmp'
    temporary.write_text(json.dumps({'request_id': str(request_id)}))
    temporary.replace(index / 'reference.json')
    return True


def for_scene(root, owner, project, request_id, version, scene, preview, generate, render_style='lived_in'):
    existing = current(root, owner, project, scene, version, preview)
    if existing is not None:
        return existing
    if location(root, owner, project, request_id).exists():
        raise ValueError('Этот запуск относится к другому виду проекта. Откройте альбом заново.')
    key = scene_key(scene)
    index = _project_path(root, owner, project) / 'scenes' / key
    # Claim by saved content, not a browser-generated UUID: concurrent tabs and
    # old clients cannot charge twice for the same kitchen.
    if not _claim(index, request_id):
        return _index_result(root, owner, project, index)
    result = once(root, owner, project, request_id, version, preview, generate,
                  render_style=render_style, scene_key=key)
    return {**result, 'request_id': str(request_id)}
