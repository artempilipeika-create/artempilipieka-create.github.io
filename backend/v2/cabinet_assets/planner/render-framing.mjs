import {viewForAspect} from './presentation.mjs';

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

// Frame the actual project in the same 16:9 viewport used for a client PNG.
export function frameRenderView(app, onRender) {
  if (document.getElementById('render-camera-dialog')) return;
  const scene = app.scene, canvas = scene.canvas, controls = scene.controls;
  const parent = canvas.parentElement, next = canvas.nextSibling, input = controls.domElement;
  const wasInert = canvas.inert, damping = controls.enableDamping;
  const previous = {view: scene.captureView(), client: scene.client, preset: scene.clientView, fit: scene.clientFit};
  const overlays = [scene.selectedBox, scene.hoverBox, scene.guides, ...scene.kitchenBoxes.values()].map(node => [node,node.visible]);

  const dialog = element('dialog');
  dialog.id = 'render-camera-dialog';
  dialog.setAttribute('aria-labelledby', 'render-camera-title');
  const title = element('h2', 'Задать ракурс');
  title.id = 'render-camera-title';
  const stage = element('div'), frame = element('div'), orbit = element('div');
  stage.className = 'render-camera-stage';
  frame.className = 'render-camera-frame';
  orbit.className = 'render-camera-input';
  orbit.tabIndex = 0;
  orbit.setAttribute('role','group');
  orbit.setAttribute('aria-label','Управление камерой');
  orbit.setAttribute('aria-describedby','render-camera-help');
  const help = element('p', matchMedia('(pointer:coarse)').matches
    ? 'Один палец поворачивает камеру. Двумя пальцами можно сдвинуть и приблизить кадр.'
    : 'Левая кнопка мыши поворачивает камеру, правая сдвигает кадр. Колесо меняет масштаб.');
  help.id = 'render-camera-help';
  const footer = element('footer'), cancel = element('button', 'Назад'), render = element('button', 'Сделать рендер');
  cancel.type = render.type = 'button';
  cancel.className = 'secondary';
  footer.append(help,cancel,render);
  frame.append(orbit);
  stage.append(frame);
  dialog.append(title,stage,footer);
  document.getElementById('planner-workspace').append(dialog);

  let initial, observer, unsubscribe, closed = false;
  function finish(shot) {
    if (closed) return;
    closed = true;
    observer?.disconnect();
    unsubscribe?.();
    app.uiAbort.signal.removeEventListener('abort',cancelFrame);
    canvas.removeEventListener('webglcontextlost',cancelFrame);
    if (controls.domElement === orbit) controls.connect(input);
    if (canvas.parentNode === frame) parent.insertBefore(canvas,next?.parentNode===parent?next:null);
    canvas.inert = wasInert;
    controls.enableDamping = damping;
    if (dialog.open) dialog.close();
    dialog.remove();
    if (scene.dead) return;
    scene.setPresentation(previous.client);
    // Orbit, pan and dolly only change pose. Keep the editor lens for this viewport.
    scene.restoreView(shot ? {...initial,position:shot.position,target:shot.target,up:shot.up} : previous.view);
    scene.clientView = previous.preset;
    scene.clientFit = previous.fit;
    for (const [node, visible] of overlays) node.visible = visible;
    app.paintMode();
    scene.invalidate();
    if (shot) onRender(shot);
  }
  const cancelFrame = () => finish(null);
  cancel.onclick = cancelFrame;
  render.onclick = () => finish(scene.captureView());
  dialog.oncancel = event => { event.preventDefault(); cancelFrame(); };
  dialog.onclose = cancelFrame;
  unsubscribe = app.bridge.subscribe(reason => { if (reason === 'before-project') cancelFrame(); });
  app.uiAbort.signal.addEventListener('abort',cancelFrame,{once:true});
  canvas.addEventListener('webglcontextlost',cancelFrame,{once:true});
  try {
    if (scene.mode !== '3d') scene.fitRenderRoom();
    initial = scene.captureView();
    dialog.showModal();
    frame.prepend(canvas);
    canvas.inert = true;
    controls.connect(orbit);
    controls.listenToKeyEvents(orbit);
    controls.enableDamping = false;
    scene.setPresentation(true);
    const bounds = frame.getBoundingClientRect();
    scene.restoreView(viewForAspect(initial,bounds.width/bounds.height));
    for (const [node] of overlays) node.visible = false;
    observer = new ResizeObserver(() => scene.resize());
    observer.observe(frame);
    orbit.focus({preventScroll:true});
    scene.render();
  } catch (error) {
    cancelFrame();
    throw error;
  }
}
