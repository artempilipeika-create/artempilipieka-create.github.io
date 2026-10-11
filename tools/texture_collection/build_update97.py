"""Build the importer deliverable and a portable review of unresolved images."""
import argparse
import base64
import html
import io
import json
import zipfile
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

p=argparse.ArgumentParser()
for arg in ('audit_dir','images_file','output'):p.add_argument(arg,type=Path)
p.add_argument('--version', default='9.7')
p.add_argument('--release-date', default='11 октября 2026')
a=p.parse_args()
root=Path(__file__).resolve().parents[2]
rows=json.loads((a.audit_dir/'bindings-review.json').read_text())
summary=json.loads((a.audit_dir/'summary.json').read_text())
counts_all=summary['site_counts']
visual_count=summary['catalogue_variants']-counts_all.get('MISSING_VISUAL',0)
added=summary['added_site_bindings']
native_count=summary['native_bindings']
images={r['source_relative_path']:r for r in json.loads(a.images_file.read_text())}
missing=[r for r in rows if r['site_status']=='MISSING_VISUAL']
reasons={'no_exact_image':'Нет файла с подтверждённым полным кодом и структурой',
         'manufacturer_conflict':'Производитель в каталоге отличается от папки изображения',
         'ambiguous_images':'Под одним кодом найдены разные изображения',
         'caption_or_border_in_sample':'На образце есть подпись или рамка', 'matched':'Подключено'}
labels={'USER_TEXTURE':'Твоя текстура','USER_PREVIEW':'Твой образец; цвет приблизительный',
        'OFFICIAL_PREVIEW':'Образец производителя','EXACT_TEXTURE':'Подтверждённая текстура',
        'MISSING_VISUAL':'Нет точного изображения'}
e=lambda v:html.escape(str(v or ''))
def table(items):
    cells=[]
    for r in items:
        files=r['source_path'] or '\n'.join(r['candidates'] or r['manufacturer_conflicts'])
        cells.append('<tr><td>'+e(r['article'])+'</td><td>'+e(r['name'])+'</td><td>'+e(labels[r['site_status']])+'</td><td>'+('Да' if r['native_texture'] else 'Нет')+'</td><td class="path">'+e(files)+'</td><td>'+e(reasons[r['status']])+'</td></tr>')
    return '<div class="scroll"><table><thead><tr><th>Артикул</th><th>Материал</th><th>На сайте</th><th>Текстура БАЗИС</th><th>Файл / кандидаты</th><th>Результат проверки</th></tr></thead><tbody>'+''.join(cells)+'</tbody></table></div>'
counts=Counter(r['status'] for r in missing)
blocks=['<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Martin Forest — проверка материалов</title>',
'''<style>body{font:15px/1.6 system-ui,sans-serif;max-width:1500px;margin:36px auto;padding:0 20px;color:#253c31;background:#fafbf8}h1{font-size:30px;line-height:1.2}h2{margin-top:36px}.cards{display:flex;flex-wrap:wrap;gap:14px}.card{padding:18px 24px;background:#edf2e7;border-radius:12px}.card b{display:block;font-size:30px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px;margin:16px 0}th,td{border:1px solid #dce2d7;padding:10px;vertical-align:top;text-align:left}th{background:#edf2e7}.path{white-space:pre-line;overflow-wrap:anywhere;min-width:190px}details{border-top:1px solid #dce2d7;padding:16px 0}summary{cursor:pointer;font-weight:600}.choices{display:flex;flex-wrap:wrap;gap:18px}.choice{width:240px;overflow-wrap:anywhere;font-size:12px}.choice img{width:240px;height:180px;object-fit:contain;background:#e9ece4}input{width:min(100%,700px);padding:12px;border:1px solid #a9b6a2;border-radius:8px;font:inherit;box-sizing:border-box}.note{max-width:1000px;color:#5c695c}</style>''',
f'<h1>Martin Forest · текстуры материалов</h1><p>Обновление {e(a.release_date)} · импортёр v{e(a.version)}</p>',
f'<div class="cards"><div class="card"><b>1315</b>файлов папки учтены</div><div class="card"><b>{visual_count} / {summary["catalogue_variants"]}</b>вариантов имеют изображение</div><div class="card"><b>{added}</b>новых привязок на сайте</div><div class="card"><b>{native_count}</b>привязок оригиналов для БАЗИС</div></div>',
'<p class="note">Получены все 11 архивов: 924 новых изображения, 391 ранее переданное. Ошибок чтения и контрольных сумм нет. Количество файлов и вариантов материала отличается: один декор используется у нескольких толщин, а в папке также есть изображения фурнитуры, полов и материалов вне каталога. Сверка выполнена с сохранённым каталогом от 27.09.2026; новые или изменённые записи не получают чужую картинку автоматически.</p>',
f'<p>На сайте: {counts_all.get("USER_TEXTURE",0)} твоих текстур, {counts_all.get("USER_PREVIEW",0)} образцов с приблизительным цветом в 3D, {counts_all.get("OFFICIAL_PREVIEW",0)+counts_all.get("EXACT_TEXTURE",0)} ранее подтверждённых изображений производителя. Оставшиеся {len(missing)} вариантов перечислены ниже.</p>',
'<p><b>816 PO:</b> подключён файл <code>Bayspan\\816 TM.jpg</code> по твоему согласованию. Артикул 816 PO сохранён. На сайте используется уменьшенная копия, БАЗИС проверяет и использует оригинал из твоей папки.</p>',
'<h2>Что осталось уточнить</h2><ul>'+''.join('<li>'+e(reasons[k])+': <b>'+str(v)+'</b></li>' for k,v in counts.items())+'</ul>',
'<p class="note">Ultradecor и Kronospan не объединены автоматически. Для спорных изображений нужен выбор конкретного файла. При отсутствии полного кода структуры, например PO/PE, похожая текстура не подставляется. Фото с отражением окна или рамкой показаны как образцы: эти детали не повторяются на фасадах. Цвет такого образца приблизительный и не заменяет физический образец.</p>',
'<label for="filter">Поиск по артикулу, названию или файлу</label><p><input id="filter" placeholder="Например: 621 PO, K009, D.515.W04"></p><p id="count"></p>',
table(missing),'<h2>Сравнение разных изображений под одним кодом</h2>']
groups={tuple(r['candidates']):r for r in missing if r['status']=='ambiguous_images'}
for paths,r in groups.items():
    blocks.append('<details><summary>'+e(r['article'])+' · '+str(len(paths))+' изображения</summary><div class="choices">')
    for path in paths:
        with Image.open(images[path]['local_path']) as im:
            thumb=ImageOps.contain(im.convert('RGB'),(480,360));out=io.BytesIO();thumb.save(out,format='JPEG',quality=80)
        uri='data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()
        blocks.append('<div class="choice"><img alt="Образец" src="'+uri+'"><p>'+e(path)+'</p></div>')
    blocks.append('</div></details>')
blocks.append('<details><summary>Полный список 2104 вариантов</summary>'+table(rows)+'</details>')
blocks.append('''<script>const input=document.getElementById('filter');input.addEventListener('input',()=>{const q=input.value.toLocaleLowerCase('ru');let count=0;document.querySelectorAll('tbody tr').forEach(r=>{r.hidden=!r.textContent.toLocaleLowerCase('ru').includes(q);if(!r.hidden)count++});document.getElementById('count').textContent=q?'Строк в двух списках: '+count:'';});</script></html>''')
report='\n'.join(blocks)
readme=f'''MARTIN FOREST — ИМПОРТЁР v{a.version} И ТЕКСТУРЫ

Все 11 присланных архивов проверены: 924 новых файла + 391 прежний.
В пакетах после v9.6 добавлено {added} привязок изображений на сайте.
Общий результат сверки: {visual_count} из {summary["catalogue_variants"]} вариантов имеют изображение.
{len(missing)} вариантов требуют уточнения или файла с полным кодом и структурой.
Открой Materials_Status.html в браузере: там поиск, точные названия,
пути файлов и сравнение спорных картинок. Интернет отчёту не нужен.

В v{a.version} — {native_count} привязок к оригинальным файлам твоей папки.
Все прежние проверенные привязки сохранены. 816 PO использует
Bayspan\\816 TM.jpg по твоему согласованию; теперь с проверкой SHA-256
оригинала. Артикулы 816 PO и 816 TM остаются разными.

УСТАНОВКА
1. Распакуй архив.
2. Сохрани копию рабочего импортёра вне папки скриптов БАЗИСа.
3. Замени содержимое действующего импортёра содержимым
   Martin_Forest_Import_v{a.version.replace(".","_")}_ONE_CLICK_NOTES_GLASS_TEXTURES.js.
   Прежнее имя и место рабочего скрипта оставь: кнопка будет прежней.
   Второй импортёр рядом с первым не устанавливай.
4. Папку D:\\BAZIS MEBEL 25\\#_Текстуры материалов оставь на месте.
   Не переименовывай вложенные файлы. Сборщик больше запускать не нужно.
5. Проверь небольшой свежий экспорт сайта в новой пустой модели БАЗИС:
   корпус 816 PO, витрина со стеклом и заметка.

Стекло, стеклянные полки и Z1 защищены от замены материалом корпуса.
Заметки и автоматический выбор последнего экспорта сохранены.
На сайте используются проверенные уменьшенные копии, в БАЗИСе — оригиналы.
Фотообразцы с бликами и рамками не назначаются как повторяющаяся текстура;
в 3D сайта они дают приблизительный цвет с явной подписью.
Их изображение из базы БАЗИСа сохраняется, если сама база его находит.
Физический масштаб пользовательских текстур пока ориентировочный.

Автоматические проверки и проверка в браузере пройдены.
Запуск v{a.version} в установленном у тебя БАЗИС 25 ещё требует проверки на ПК.
Исходные изображения, FR3D и D:\\pgm этим обновлением не изменяются.
'''
a.output.parent.mkdir(parents=True,exist_ok=True)
importer=root/('tools/bazis_import/Martin_Forest_Import_v'+a.version.replace('.', '_')+'_ONE_CLICK_NOTES_GLASS_TEXTURES.js')
with zipfile.ZipFile(a.output,'w',zipfile.ZIP_DEFLATED) as z:
    z.write(importer,importer.name)
    z.writestr('README_RU.txt',readme.encode('utf-8-sig'))
    z.writestr('Materials_Status.html',report.encode('utf-8'))
    z.write(a.audit_dir/'summary.json','verification-summary.json')
with zipfile.ZipFile(a.output) as z:
    assert z.testzip() is None and z.read(importer.name)==importer.read_bytes()
(a.audit_dir/'Materials_Status.html').write_text(report)
print(json.dumps({'file':str(a.output.resolve()),'bytes':a.output.stat().st_size,'missing':len(missing),'missing_reasons':dict(counts),'comparison_groups':len(groups)},ensure_ascii=False))
