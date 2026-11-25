// One saved project, one paid original for the client PDF.
function albumSubject(items=[]){
 const wardrobe=items.some(it=>it.module_type==='wardrobe'||it.module_type==='blank'&&
  (['shelves','divided'].includes(it.assistant_carcass?.spec?.recipe)||/^Шкаф с (полками|перегородкой) ·/.test(it.name)));
 if(!wardrobe)return 'kitchen';
 return items.some(it=>!['blank','wardrobe'].includes(it.module_type))?'mixed':'wardrobe';
}
export async function openKitchenAlbum({save,snapshot,capture,request,setOrderNumber,hasCurrentView=false}){
  if(document.getElementById('kitchen-album-dialog'))return;
  const d=document.createElement('dialog');d.id='kitchen-album-dialog';d.className='mf-sales-dialog mf-kitchen-album';
  d.setAttribute('aria-labelledby','kitchen-album-title');
  const mode=albumSubject(snapshot()?.scene?.items),wardrobe=mode==='wardrobe';
  const title={wardrobe:'Альбом шкафа',kitchen:'Альбом вашей кухни',mixed:'Альбом проекта'}[mode];
  d.innerHTML=`<div class="mf-sales-heading"><div><small>MARTIN FOREST</small><h2 id="kitchen-album-title">${title}</h2></div><button type="button" data-close aria-label="Закрыть">×</button></div>
    <label>Номер заказа для обложки<input data-order maxlength="60" autocomplete="off" placeholder="Например, МФ-2026-125"></label>
    ${wardrobe?'<label data-view-label>Ракурс шкафа<select data-view><option value="full">Шкаф целиком</option>'+(hasCurrentView?'<option value="current">Текущий ракурс из 3D</option>':'')+'</select></label>':''}
    <div class="mf-album-cover">
      <canvas data-preview width="1200" height="849" aria-label="Рендер проекта"></canvas>
      <div data-cover-price class="mf-album-cover-price" hidden><span data-cover-label></span><strong data-cover-amount></strong></div>
    </div>
    <section data-breakdown class="mf-album-breakdown" aria-label="Расчёт стоимости заказа" hidden>
      <dl><div><dt>Фурнитура</dt><dd data-hardware></dd></div>
        <div><dt>Материалы</dt><dd data-materials></dd></div>
        <div><dt>Работы</dt><dd data-work></dd></div>
        <div class="mf-album-total"><dt data-total-label></dt><dd data-total></dd></div></dl>
      <p data-price-note hidden></p>
    </section>
    <label class="mf-sales-check"><input data-consent type="checkbox">Разрешаю одну платную генерацию фоторендера для альбома.</label>
    <p data-message role="status" aria-live="polite">Сохраняем проект и проверяем готовый фоторендер…</p>
    <div class="mf-sales-actions"><button data-create disabled>Создать фоторендер и PDF</button><button data-check class="secondary" hidden>Обновить статус</button><button data-build class="secondary" hidden>Собрать PDF из готового рендера</button><a data-photo class="presentation-download" hidden>Скачать фоторендер</a><a data-pdf class="presentation-download" hidden>Скачать альбом · PDF</a></div>`;
  document.body.append(d);d.showModal();
  const q=s=>d.querySelector(s),say=t=>q('[data-message]').textContent=t;
  const showError=error=>{
    say(error.message);q('[data-message]').setAttribute('role','alert');
    q('[data-message]').scrollIntoView?.({block:'nearest'});
  };
  let frozen,views,angle='full',hero=null,pdfURL=null,busy=true,automatic=false,closed=false,requested=false,timer=null;
  const requestId=crypto.randomUUID();
  const orderNumber=()=>String(q('[data-order]').value||'').trim();
  const same=()=>frozen&&JSON.stringify(snapshot())===JSON.stringify(frozen);
  const assertSame=()=>{if(!same())throw Error('Проект изменился. Закройте альбом и откройте заново, чтобы использовать сохранённую версию.');};
  const refresh=()=>{
    q('[data-create]').disabled=busy||requested||!automatic||!q('[data-consent]').checked||!frozen||!orderNumber();
    q('[data-create]').hidden=requested||Boolean(hero);
    q('[data-consent]').disabled=busy||!automatic;
    q('[data-consent]').closest('label').hidden=requested||Boolean(hero);
    q('[data-check]').hidden=!requested||Boolean(hero);q('[data-check]').disabled=busy;
    q('[data-build]').hidden=!hero||Boolean(pdfURL);q('[data-build]').disabled=busy||!orderNumber();
    q('[data-order]').disabled=busy;
    q('[data-photo]').hidden=!hero;q('[data-pdf]').hidden=!pdfURL;
    if(wardrobe){q('[data-view-label]').hidden=requested||Boolean(hero);q('[data-view]').disabled=busy||requested||Boolean(hero);}
    d.setAttribute('aria-busy',String(busy));
  };
  const close=()=>{closed=true;clearTimeout(timer);if(pdfURL)URL.revokeObjectURL(pdfURL);d.close();d.remove();};
  q('[data-close]').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close();});
  q('[data-consent]').onchange=refresh;
  const draw=async data=>{
    const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))]));
    try{
      if(closed)return;
      const canvas=q('[data-preview]'),ctx=canvas.getContext('2d');ctx.fillStyle='#f6f3ed';ctx.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.max(canvas.width/bitmap.width,canvas.height/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
      ctx.drawImage(bitmap,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    }finally{bitmap.close();}
  };
  const showPrice=price=>{
    q('[data-cover-price]').hidden=!price;q('[data-breakdown]').hidden=!price;
    if(!price)return;
    q('[data-cover-label]').textContent=price.label;
    q('[data-cover-amount]').textContent=q('[data-total]').textContent=price.amount;
    q('[data-total-label]').textContent=price.total_label;
    for(const key of ['hardware','materials','work'])q('[data-'+key+']').textContent=price.groups[key];
    q('[data-price-note]').textContent=price.note;q('[data-price-note]').hidden=!price.note;
  };
  const build=async()=>{
    assertSame();if(!orderNumber()){say('Укажите номер заказа для обложки. Готовый рендер сохранён.');return;}say('Фоторендер готов. Автоматически помещаем его в PDF-альбом…');
    const r=await fetch(`/api/v2/3d-projects/${frozen.id}/sales-album.pdf`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:frozen.version,layout:'client',hero_data_url:hero,photo:true})});
    if(!r.ok){const b=await r.json().catch(()=>({}));throw Error(b.detail?.code||'Не удалось собрать PDF. Фоторендер сохранён; повторная сборка PDF бесплатна.');}
    const blob=await r.blob();assertSame();if(closed)return;
    const price=JSON.parse(r.headers.get('X-MF-Album-Price'));
    if(!price)throw Error('Не удалось получить стоимость заказа. Соберите PDF ещё раз.');
    showPrice(price);
    if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL=URL.createObjectURL(blob);
    q('[data-pdf]').href=pdfURL;q('[data-pdf]').download=wardrobe?'Martin_Forest_Wardrobe_Album.pdf':mode==='mixed'?'Martin_Forest_Album.pdf':'Martin_Forest_Kitchen_Album.pdf';
    say('Альбом готов.');
  };
  const consume=async result=>{
    if(closed)return;assertSame();
    if(result.state==='none'){
      if(requested)throw Error('Сохранённый результат пока не найден. Новая платная генерация не запущена.');
      say(automatic?'Проект сохранён. Подтвердите одну платную генерацию — дальше PDF соберётся автоматически.':'Сервис фоторендера сейчас недоступен. Ранее оплаченные изображения будут доступны после восстановления сервиса.');return;
    }
    requested=true;
    if(result.state==='pending'){
      say('Фоторендер создаётся. PDF соберётся автоматически. Проверка готовности бесплатна.');
      clearTimeout(timer);timer=setTimeout(()=>perform(check),3000);return;
    }
    if(result.state!=='ready')throw Error(result.message||'Рендер не получен. Повторный платный запрос не запускается.');
    clearTimeout(timer);hero=result.image_data_url;
    const photo=q('[data-photo]');
    photo.href=hero;photo.download='Martin_Forest_'+(wardrobe?'Wardrobe':'Render')+'.'+(hero.startsWith('data:image/png;')?'png':hero.startsWith('data:image/webp;')?'webp':'jpg');
    await draw(hero);if(!closed)await build();
  };
  const perform=async action=>{
    if(busy||closed)return;clearTimeout(timer);busy=true;refresh();
    try{assertSame();await action();}catch(error){if(!closed)showError(error);}finally{busy=false;if(!closed)refresh();}
  };
  const check=async()=>{say('Проверяем сохранённый результат без новой генерации…');await consume(await request(`/3d-projects/${frozen.id}/sales-photo`));};
  q('[data-create]').onclick=()=>perform(async()=>{
    if(requested||!automatic||!q('[data-consent]').checked||!orderNumber())return;
    requested=true;refresh();say('Создаём один фоторендер в стиле «Живой интерьер», затем автоматически соберём PDF.');
    await consume(await request(`/3d-projects/${frozen.id}/sales-photo`,'POST',{version:frozen.version,preview_data_url:views.hero,request_id:requestId,paid_confirmed:true,render_style:'lived_in'}));
  });
  q('[data-order]').onchange=()=>perform(async()=>{
    if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null;showPrice(null);}
    const value=orderNumber();if(!value)throw Error('Укажите номер заказа для обложки.');
    if(typeof setOrderNumber!=='function')throw Error('Обновите страницу, чтобы сохранить номер заказа.');
    setOrderNumber(value);await save();frozen=structuredClone(snapshot());
    if(hero)await build();else say('Номер заказа сохранён. Подтвердите одну генерацию фоторендера.');
  });
  if(wardrobe)q('[data-view]').onchange=()=>perform(async()=>{
    const select=q('[data-view]'),chosen=select.value;
    say('Готовим предпросмотр выбранного ракурса…');
    try{
      const next=await capture(mode,chosen);assertSame();await draw(next.hero);views=next;angle=chosen;
      say('Ракурс готов. Для создания фоторендера подтвердите одну платную генерацию.');
    }catch(error){select.value=angle;throw error;}
  });
  q('[data-check]').onclick=()=>perform(check);
  q('[data-build]').onclick=()=>perform(build);
  q('[data-photo]').onclick=e=>{if(!hero||!same()){e.preventDefault();say('Проект изменился. Откройте альбом заново.');}};
  q('[data-pdf]').onclick=e=>{if(!same()||!pdfURL){e.preventDefault();say('Проект изменился. Откройте альбом заново для сохранённой версии.');}};
  refresh();
  try{
    await save();if(closed)return;frozen=structuredClone(snapshot());views=await capture(mode);if(closed)return;await draw(views.hero);q('[data-order]').value=frozen.scene?.albumSettings?.order_number||'';
    const result=await request(`/3d-projects/${frozen.id}/sales-photo/reuse`,'POST',{version:frozen.version,preview_data_url:views.hero});
    if(closed)return;
    // A missing provider/key must not prevent retrieval of an already paid image.
    if(result.state==='none'){
      say('Проверяем сборку PDF до платной генерации…');
      await request(`/3d-projects/${frozen.id}/sales-album/preflight`,'POST',{version:frozen.version});
      const capabilities=await request('/3d-sales-capabilities');automatic=capabilities.automatic_render;
    }
    await consume(result);
  }catch(error){if(!closed)showError(error);}finally{busy=false;if(!closed)refresh();}
}
