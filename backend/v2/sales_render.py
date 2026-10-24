"""Optional server-side image edit adapter; never stores or exposes the API key."""
import base64, hashlib, json, os, threading
import httpx
from .sales_album import image_bytes

_LOCK=threading.Lock()
_ACTIVE=set()


def available():
    return bool(os.environ.get('MF_IMAGE_API_KEY'))


def generate(owner,scene,materials,preview):
    key=os.environ.get('MF_IMAGE_API_KEY')
    if not key:raise ValueError('Автоматический фоторендер пока не подключён. Добавьте готовую картинку.')
    image=image_bytes(preview)
    if not image:raise ValueError('Не удалось получить вид из конструктора')
    with _LOCK:
        if owner in _ACTIVE or len(_ACTIVE)>=2:raise ValueError('Фоторендер уже создаётся. Дождитесь завершения.')
        _ACTIVE.add(owner)
    try:
        modules=[{k:it.get(k) for k in ('name','width','height','depth','body_variant_id','front_variant_id','plinthMaterialId','countertopMaterialId','layout','drawers')} for it in scene.get('items',[])]
        prompt=('Create a photorealistic architectural photograph from this exact kitchen view. Preserve ALL cabinet geometry, number and divisions of doors/drawers, plinth shape, positions, appliance openings and camera. '
                'Match the specified material decors; do not invent wood grain on solid colours. Improve lighting, reflections and surface realism. You may improve the room, but must not conceal or replace any cabinetry. No text or dimension labels. '
                'Saved project modules: '+json.dumps(modules,ensure_ascii=False)+'. Material names: '+json.dumps(materials,ensure_ascii=False))
        if len(prompt)>31000:raise ValueError('Проект слишком большой для одного фоторендера')
        with httpx.Client(timeout=httpx.Timeout(180,connect=15),follow_redirects=False) as client:
            response=client.post('https://api.openai.com/v1/images/edits',headers={'Authorization':'Bearer '+key},
                data={'model':os.environ.get('MF_IMAGE_MODEL','gpt-image-2.5-sunburst'),'prompt':prompt,'n':'1','size':'1536x1024','quality':'high','output_format':'jpeg','safety_identifier':hashlib.sha256(str(owner).encode()).hexdigest()},
                files={'image':('project.jpg',image,'image/jpeg')})
        if response.status_code!=200:raise ValueError('Сервис фоторендера не выполнил запрос. Проверьте подключение и баланс; повторите вручную.')
        data=response.json()['data'][0]['b64_json']
        checked=image_bytes('data:image/jpeg;base64,'+data)
        return 'data:image/jpeg;base64,'+base64.b64encode(checked).decode()
    except (httpx.HTTPError,KeyError,IndexError,TypeError) as exc:
        raise ValueError('Фоторендер не получен. Проверьте подключение; повторите вручную.') from exc
    finally:
        with _LOCK:_ACTIVE.discard(owner)
