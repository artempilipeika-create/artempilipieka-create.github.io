"""Build the SPEC v2 presentation layer around the preserved v9 workspace.

public/ is the Railway web root. Root/preview mirrors are kept in sync for
existing static entrypoints. No catalogue or business-logic file is rewritten.
"""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'

def header(prefix='', active=None, workspace=False, logout=False):
    nav = [('Главная',''),('О компании','about/'),('Услуги','services/'),('Как мы работаем','how-it-works/'),('Контакты','contacts/')]
    links = ''.join(f'<a href="{prefix}{url or "index.html"}"'+(' aria-current="page"' if active == url else '')+f'>{label}</a>' for label,url in nav)
    account = f'<a class="mf-account" data-account-link href="{prefix}login.html">Войти</a>'
    cta = f'<a class="mf-cta" href="{prefix}order/">Подготовить заказ</a>'
    staff = f'<a data-staff-link hidden href="{prefix}scraps.html">Обрезки</a><a data-staff-link hidden id="adminNav" href="{prefix}admin.html">Управление</a>' if workspace else ''
    return f'''<a class="mf-skip" href="#content">К содержимому</a>
<header class="mf-header"><div class="mf-wrap">
  <div class="mf-topline"><span class="mf-caption">Распил и<br>кромкооблицовка</span>
    <a class="mf-brand" href="{prefix}index.html" aria-label="Martin Forest — главная">Martin Forest<small>МАРТИН ФОРЕСТ</small></a>
    <a class="mf-telephone" href="tel:+375295315315">+375 29 531-53-15</a>
    <details class="mf-menu"><summary><span>Меню</span><span class="mf-menu-lines" aria-hidden="true"></span></summary><nav class="mf-menu-panel" aria-label="Мобильная навигация">{links}{account}{cta}<a class="mf-telephone" href="tel:+375295315315">+375 29 531-53-15</a>{'<button class="mf-logout" data-mobile-logout>Выйти</button>' if logout else ''}</nav></details>
  </div>
  <div class="mf-navigation"><nav class="mf-nav" aria-label="Основная навигация">{links}</nav><div class="mf-actions">{account}{cta}{'<button class="mf-logout" id="logout">Выйти</button>' if logout else ''}</div></div>
  {f'<div class="mf-staff-links">{staff}</div>' if staff else ''}
</div></header>'''

def footer(prefix=''):
    return f'''<footer class="mf-footer"><div class="mf-wrap mf-footer-grid">
<div><a class="mf-brand" href="{prefix}index.html">Martin Forest<small>МАРТИН ФОРЕСТ</small></a><p class="mf-footer-tag">Мебель начинается с деталей.<br>Мы помогаем их подготовить.</p></div>
<div><h3>Компания</h3><nav class="mf-footer-links" aria-label="Компания"><a href="{prefix}about/">О компании</a><a href="{prefix}services/">Услуги</a><a href="{prefix}how-it-works/">Как мы работаем</a><a href="{prefix}contacts/">Контакты</a></nav></div>
<div><h3>Заказчикам</h3><nav class="mf-footer-links" aria-label="Заказчикам"><a href="{prefix}order/">Подготовить заказ</a><a href="{prefix}services/raspil/">Распил</a><a href="{prefix}services/kromka/">Кромкооблицовка</a><a href="{prefix}3d/">3D-конструктор</a><a href="{prefix}account.html">Личный кабинет</a></nav></div>
</div><div class="mf-wrap mf-footer-bottom"><span>© Martin Forest · Распил и кромкооблицовка</span><a href="#top">Наверх ↑</a></div></footer>'''

def page(title, body, prefix='', cls='', description='Распил мебельных плит и кромкооблицовка по вашей деталировке. Martin Forest.'):
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#153d2d"><meta name="description" content="{description}"><meta name="robots" content="noindex,nofollow"><title>{title} — Martin Forest</title><link rel="stylesheet" href="{prefix}site-v2.css"><link rel="icon" href="{prefix}favicon.svg" type="image/svg+xml"></head>
<body id="top" class="mf-public {cls}">{body}{footer(prefix)}<script src="{prefix}site-nav.js" defer></script></body></html>'''

def paths(prefix=''):
    return f'''<div class="mf-paths"><article class="mf-path"><p class="mf-kicker">01 / С помощью менеджера</p><h3>Отдать менеджеру<br>на обработку</h3><p class="mf-prose">Загрузите исходный Excel и добавьте пожелания. Менеджер проверит файл, уточнит материалы и подготовит заказ к расчёту.</p><a class="mf-button" href="{prefix}order.html?mode=manager">Отдать менеджеру на обработку <span aria-hidden="true">↗</span></a></article><article class="mf-path"><p class="mf-kicker">02 / Самостоятельно</p><h3>Подготовить<br>самостоятельно</h3><p class="mf-prose">Импортируйте Excel или внесите детали вручную. Выберите материалы, проверьте размеры и стороны кромки — затем отправьте заказ на проверку.</p><a class="mf-button" href="{prefix}order.html?mode=self">Подготовить самостоятельно <span aria-hidden="true">↗</span></a></article></div>'''

def services(prefix=''):
    return f'''<a class="mf-service-row" href="{prefix}services/raspil/"><span class="mf-service-number">01</span><h3>Распил по размерам</h3><p>Подготовим мебельные детали по вашему списку. Учтём материал, количество и направление текстуры.</p><span class="mf-round-arrow" aria-hidden="true">↗</span></a><a class="mf-service-row" href="{prefix}services/kromka/"><span class="mf-service-number">02</span><h3>Кромкооблицовка</h3><p>Облицуем торцы по согласованной схеме. Декор, толщина кромки и каждая сторона — под ваш проект.</p><span class="mf-round-arrow" aria-hidden="true">↗</span></a>'''

steps = [('Подготовка','Excel менеджеру или самостоятельная деталировка.'),('Проверка и расчёт','Уточняем материалы, кромку и производственные данные.'),('Согласование','Фиксируем состав заказа и итоговую стоимость.'),('Изготовление','Выполняем согласованный заказ.'),('Выдача','Сообщаем о готовности и согласуем получение.')]
steps_html = '<div class="mf-steps">'+''.join(f'<article class="mf-step"><span>0{i}</span><h3>{title}</h3><p>{text}</p></article>' for i,(title,text) in enumerate(steps,1))+'</div>'

home = f'''<div class="mf-hero"><img class="mf-hero-image" src="assets/panels.webp" alt="Текстура и торцы мебельных плит" width="1536" height="1024" fetchpriority="high"><div class="mf-hero-shade"></div>{header(active='')}
<div class="mf-wrap"><section class="mf-hero-copy"><p class="mf-eyebrow">Мартин Форест / Мебельные детали</p><h1>Распил и кромкооблицовка</h1><p class="mf-hero-subtitle">Для ваших проектов. По вашим размерам.</p><div class="mf-hero-buttons"><a class="mf-button mf-button-light" href="order/">Подготовить заказ <span aria-hidden="true">↗</span></a><a class="mf-text-link" href="how-it-works/">Как мы работаем <span aria-hidden="true">↗</span></a></div></section></div>
<div class="mf-hero-bottom"><div class="mf-wrap"><span>Материал · Размеры · Внимание к детали</span><span>От вашей деталировки — к готовым деталям</span></div></div></div>
<main id="content">
<section class="mf-section mf-wrap mf-intro"><div><p class="mf-kicker">Всё начинается с деталей</p><h2>Каждая деталь<br>на своём месте.</h2><p class="mf-prose">Для кухни, шкафа, гардеробной или отдельной полки — подготовим детали по вашему проекту.</p><p class="mf-prose">Вы задаёте размеры и выбираете материал. Мы проверяем деталировку, согласовываем кромку и направление текстуры, рассчитываем заказ и выполняем работу.</p><a class="mf-text-link" href="about/">О Martin Forest <span aria-hidden="true">↗</span></a></div><figure class="mf-material-photo"><img src="assets/panels.webp" alt="Мебельные плиты с выразительной древесной фактурой" width="1536" height="1024" loading="lazy"><figcaption><strong>Материал, который становится мебелью.</strong><span>Фактура / Торец / Деталь</span></figcaption></figure></section>
<section class="mf-section mf-services" id="services"><div class="mf-wrap"><div class="mf-section-heading"><div><p class="mf-kicker">Что мы делаем</p><h2>От плиты<br>до вашей детали.</h2></div><p>Две основные операции, от которых зависит аккуратность будущей мебели.</p></div>{services()}</div></section>
<section class="mf-section mf-wrap" id="prepare"><div class="mf-order-heading"><p class="mf-kicker">Подготовка заказа</p><h2>Выберите удобный<br>способ начать.</h2><p class="mf-prose">Готовую деталировку можно передать менеджеру или самостоятельно подготовить на сайте.</p></div>{paths()}</section>
<section class="mf-materials"><img class="mf-materials-image" src="assets/panels.webp" alt="Натуральная древесная фактура мебельных плит" width="1536" height="1024" loading="lazy"><div class="mf-materials-copy"><p class="mf-kicker">Материалы и кромка</p><h2>Основа вашего<br>проекта.</h2><p class="mf-prose">Декор, структура и торец работают вместе. Подберём кромку к выбранному материалу и проверим каждое назначение перед запуском заказа.</p><div class="mf-brands"><span>EGGER</span><span>BYSPAN</span><span>ULTRADECOR</span></div><p class="mf-materials-note">Работаем и с материалом клиента. Формат листа, толщину и условия обработки согласуем при подготовке заказа.</p><a class="mf-text-link" href="order/">Подготовить деталировку <span aria-hidden="true">↗</span></a></div></section>
<section class="mf-section mf-wrap"><div class="mf-section-heading"><div><p class="mf-kicker">Как мы работаем</p><h2>Понятный путь<br>от заявки до выдачи.</h2></div><p>Предварительный расчёт уточняем после раскроя и проверки. В работу идёт согласованный заказ.</p></div>{steps_html}</section>
<section class="mf-section mf-constructor"><div class="mf-wrap mf-constructor-grid"><div><p class="mf-kicker">Ещё один способ начать</p><h2>Сначала —<br>представить в объёме.</h2><p class="mf-prose">В 3D-конструкторе комода можно изменить размеры, выбрать компоновку и материалы, затем перенести предварительный список деталей в заказ.</p><a class="mf-text-link" href="3d/">О 3D-конструкторе <span aria-hidden="true">↗</span></a></div><div class="mf-constructor-details"><p class="mf-kicker">3D / Комод</p><h3>Ваша идея.<br>Ваши размеры.</h3><dl><div><dt>Габариты</dt><dd>Ширина, высота и глубина</dd></div><div><dt>Компоновка</dt><dd>Ящики, двери и внутреннее пространство</dd></div><div><dt>Материалы</dt><dd>Корпус и фасады</dd></div></dl><a class="mf-text-link" href="constructor.html">Открыть конструктор <span aria-hidden="true">↗</span></a></div></div></section>
<section class="mf-contact"><div class="mf-wrap mf-contact-grid"><div><p class="mf-kicker">На связи — Martin Forest</p><h2>Обсудим<br>ваш заказ?</h2></div><div class="mf-contact-data"><a class="mf-contact-number" href="tel:+375295315315">+375 29 531-53-15</a><p>Уточним материалы, подготовку деталировки и порядок работы.</p><a class="mf-button" href="order/">Подготовить заказ <span aria-hidden="true">↗</span></a></div></div></section>
</main>'''
(PUBLIC/'index.html').write_text(page('Распил и кромкооблицовка',home,cls='mf-home'))

def subpage(route,title,intro,content,active):
    depth=len(route.strip('/').split('/')); prefix='../'*depth
    body=header(prefix,active)+f'<main id="content"><section class="mf-subhero"><div class="mf-wrap"><p class="mf-kicker">Martin Forest</p><h1>{title}</h1><p class="mf-prose">{intro}</p></div></section>{content}</main>'
    target=PUBLIC/route/'index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(page(title,body,prefix))

subpage('about','Каждая деталь на своём месте.','Martin Forest — распил мебельных плит и кромкооблицовка по вашей деталировке.', '<section class="mf-wrap mf-reading mf-reading-grid"><div><h2>Работаем с вашим проектом</h2><p class="mf-prose">Кухня, шкаф, гардеробная или отдельная полка начинаются с материала и точного списка деталей. Мы помогаем подготовить этот список к производству.</p><h2>Согласуем до начала работ</h2><p class="mf-prose">Проверяем размеры, количество, направление текстуры и стороны кромки. Если в деталировке есть вопросы, уточняем их вместе с вами.</p><a class="mf-text-link" href="../order/">Подготовить заказ <span>↗</span></a></div><img src="../assets/panels.webp" alt="Фактура мебельных плит" width="1536" height="1024"></section>','about/')
subpage('services','Распил и кромкооблицовка','Подготовим мебельные детали по согласованным размерам, материалам и схеме облицовки торцов.',f'<section class="mf-wrap mf-reading">{services("../")}</section>','services/')
subpage('services/raspil','Распил по вашим размерам','Мебельные плиты превращаются в детали по вашей деталировке.', '<section class="mf-wrap mf-reading mf-reading-grid"><div><h2>Что нужно для заказа</h2><p class="mf-prose">Укажите материал и его артикул, готовые размеры, количество деталей и направление текстуры. В одном заказе можно использовать несколько материалов.</p><ul><li>Полный артикул материала со структурой.</li><li>Длина, ширина и количество каждой детали.</li><li>Текстура, разрешение на вращение и комментарии.</li><li>Стороны кромки, если требуется облицовка.</li></ul><h2>С вашим материалом</h2><p class="mf-prose">Укажите толщину и фактический формат листа. Стоимость услуг рассчитывается отдельно от материала.</p><div class="mf-note">Окончательная стоимость фиксируется после производственного раскроя и проверки менеджером.</div><a class="mf-text-link" href="../../order/">Подготовить заказ <span>↗</span></a></div><img src="../../assets/panels.webp" alt="Торцы и плоскости мебельных плит" width="1536" height="1024"></section>','services/')
subpage('services/kromka','Кромкооблицовка','Декор, толщина и стороны кромки — под ваш проект.', '<section class="mf-wrap mf-reading"><h2>Каждая сторона имеет значение</h2><p class="mf-prose">Назначьте кромку на нужные торцы детали: L1, L2, W1 и W2. Для каждой стороны можно выбрать собственную кромку или использовать назначение по умолчанию.</p><h2>Материал и кромка вместе</h2><p class="mf-prose">Проверим соответствие декора, размер кромки и особенности обработки. Ручные назначения кромки проверяем отдельно от автоматического подбора.</p><h2>Кромка клиента</h2><p class="mf-prose">Можно указать кромку заказчика. Её характеристики и возможность применения согласуем перед запуском, услуги оклейки учитываются отдельно.</p><a class="mf-text-link" href="../../order/">Указать кромку в заказе <span>↗</span></a></section>','services/')
subpage('how-it-works','От заявки к готовым деталям','Подготовка, проверка и согласование — до начала изготовления.',f'<section class="mf-wrap mf-reading">{steps_html}<div class="mf-note">Сумма на этапе подготовки — предварительная. Итоговую стоимость согласуем после раскроя и проверки производственных данных.</div><a class="mf-text-link" href="../order/">Перейти к подготовке заказа <span>↗</span></a></section>','how-it-works/')
subpage('order','Подготовить заказ','Передайте исходный файл менеджеру или подготовьте деталировку самостоятельно.',f'<section class="mf-wrap mf-reading">{paths("../")}<h2>Что подготовить</h2><p class="mf-prose">Материал и артикул, длину, ширину, количество, направление текстуры и стороны кромки. Если есть особые требования — добавьте комментарий. Для сохранения и отправки заказа потребуется вход в личный кабинет.</p><div class="mf-note">В Excel обозначения X1 / X2 / Y1 / Y2 соответствуют L1 / L2 / W1 / W2. Перед отправкой проверьте сопоставление колонок и количество деталей.</div></section>','order/')
subpage('3d','Представьте комод в объёме','Размеры, компоновка и материалы — в существующем 3D-конструкторе Martin Forest.', '<section class="mf-wrap mf-reading mf-reading-grid"><div><h2>От идеи к деталировке</h2><p class="mf-prose">Выберите компоновку комода, измените ширину, высоту и глубину, подберите материалы корпуса и фасадов. Предварительный список деталей можно перенести в редактор заказа.</p><div class="mf-note">Конструктор — производственный прототип. Состав деталей и конструктив проверяются перед изготовлением. Для работы нужен вход и доступ к 3D.</div><a class="mf-text-link" href="../constructor.html">Открыть 3D-конструктор <span>↗</span></a></div><div class="mf-constructor-details"><p class="mf-kicker">От общего — к деталям</p><h3>Размеры.<br>Компоновка.<br>Материалы.</h3><p class="mf-prose">Рабочий инструмент сохранён в отдельном разделе. Подготовленную деталировку можно продолжить в редакторе заказа.</p></div></section>','3d/')
subpage('contacts','На связи — Martin Forest','Обсудим материал, подготовку деталировки и ваш заказ.', '<section class="mf-wrap mf-reading"><p class="mf-kicker">Контактный телефон</p><a class="mf-contact-number" href="tel:+375295315315">+375 29 531-53-15</a><h2>Начните с деталей</h2><p class="mf-prose">Если у вас уже есть Excel с деталировкой, передайте его менеджеру через подготовку заказа. Если только планируете работу — позвоните, чтобы уточнить необходимые данные.</p><a class="mf-text-link" href="../order/">Подготовить заказ <span>↗</span></a></section>','contacts/')

# Apply the common shell only; preserve existing forms, IDs and business scripts.
for name in ['order.html','account.html','admin.html','constructor.html','scraps.html','login.html','register.html']:
    target=PUBLIC/name;text=target.read_text()
    if 'site-v2.css' not in text:text=text.replace('</head>','<link rel="stylesheet" href="site-v2.css"></head>')
    text=re.sub(r'<a class="mf-skip".*?</a>\s*','',text,flags=re.S)
    text=re.sub(r'<header\b.*?</header>','',text,count=1,flags=re.S)
    text=re.sub(r'<footer\b.*?</footer>','',text,flags=re.S)
    text=re.sub(r'<script src="site-nav.js"[^>]*></script>','',text)
    m=re.search(r'<body([^>]*)>',text); attrs=re.sub(r'\s+id="[^"]*"','',m.group(1))
    if 'class=' in attrs:attrs=re.sub(r'class="([^"]*)"',lambda x:'class="'+x.group(1).replace(' mf-work','')+' mf-work"',attrs)
    else:attrs+=' class="mf-work"'
    text=text[:m.start()]+f'<body{attrs} id="top">'+header(workspace=True,logout=name in ['account.html','admin.html'])+text[m.end():]
    text=text.replace('<main>','<main id="content">',1)
    if name in ['login.html','register.html']:text=text.replace('<main class="auth-shell">','<main class="auth-shell" id="content">')
    if name == 'order.html' and 'preparation-mode.js' not in text:text=text.replace('<script src="order.js">','<script src="preparation-mode.js"></script><script src="order.js">')
    if name == 'register.html':text=text.replace('name:name.value','name:document.getElementById("name").value')
    text=text.replace('</body>',footer()+'<script src="site-nav.js" defer></script></body>')
    target.write_text(text)

(PUBLIC/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="2" fill="#153d2d"/><text x="16" y="23" text-anchor="middle" font-family="Georgia,serif" font-size="25" fill="#f6f3eb">M</text></svg>')

# Keep existing static mirrors usable without changing their JS or data snapshots.
for name in ['index.html','order.html','account.html','admin.html','constructor.html','scraps.html','login.html','register.html','site-v2.css','site-nav.js','preparation-mode.js','favicon.svg','review.html']:
    for dst in [ROOT/name,ROOT/'preview'/name]:shutil.copyfile(PUBLIC/name,dst)
for name in ['about','services','how-it-works','order','3d','contacts','assets']:
    for dst in [ROOT/name,ROOT/'preview'/name]:shutil.copytree(PUBLIC/name,dst,dirs_exist_ok=True)
print('Presentation layer built; existing order/import/export/business scripts preserved.')
