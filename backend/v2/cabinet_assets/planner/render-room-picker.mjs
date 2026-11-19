import {rooms, roomCategories, roomById} from './render-rooms/catalogue.mjs';

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

export class RenderRoomPicker {
  constructor(app, apply) {
    this.app = app;
    this.apply = apply;
    this.element = element('section');
    this.element.id = 'render-room-picker';
    this.summary = element('button');
    const caption = element('span', 'Варианты отделки');
    this.roomName = element('small');
    caption.append(this.roomName);
    this.summary.append(caption);
    this.summary.type = 'button';
    this.summary.className = 'render-room-toggle';
    this.summary.setAttribute('aria-expanded', 'false');
    this.summary.setAttribute('aria-controls', 'render-room-options');
    const options = element('div');
    options.id = 'render-room-options';
    options.hidden = true;
    app.listen(this.summary, 'click', () => {
      options.hidden = !options.hidden;
      this.element.toggleAttribute('data-open', !options.hidden);
      this.summary.setAttribute('aria-expanded', String(!options.hidden));
    });
    this.element.append(this.summary, options);
    const label = element('label', 'Группа отделок');
    this.category = element('select');
    roomCategories.forEach((group, index) => this.category.add(new Option(group, String(index))));
    label.append(this.category);
    this.cards = element('div');
    this.cards.className = 'render-room-cards';
    this.buttons = rooms.map((item, index) => {
      const button = element('button');
      button.type = 'button';
      button.dataset.roomId = String(item.n);
      button.title = item.note;
      const image = element('img');
      image.loading = 'lazy';
      image.width = 380;
      image.height = 224;
      image.alt = '';
      image.src = '/account/planner/render-rooms/' + String(item.n).padStart(2, '0') + '.webp?v=measured-1';
      button.append(image, element('span', item.name));
      button.hidden = index >= 5;
      app.listen(button, 'click', () => this.choose(item));
      this.cards.append(button);
      return button;
    });
    this.status = element('p');
    this.status.setAttribute('role', 'status');
    this.reset = element('button', 'Прежнее оформление проекта');
    this.reset.type = 'button';
    app.listen(this.reset, 'click', () => apply({renderRoomId: null}));
    this.actions = element('div');
    this.actions.id = 'render-room-actions';
    const frame = element('button', 'Задать ракурс');
    frame.id = 'render-room-frame';
    frame.type = 'button';
    app.listen(frame, 'click', () => app.presentation?.frameRoom());
    this.png = element('button', 'Картинка для клиента');
    this.png.type = 'button';
    app.listen(this.png, 'click', () => app.presentation?.open({clean: true}));
    this.studio = element('a', 'Открыть студию GLB / OBJ');
    this.studio.target = '_blank';
    this.studio.rel = 'noopener';
    options.append(label, this.cards, this.reset, this.studio);
    this.actions.append(frame, this.png);
    this.element.append(this.status, this.actions);
    app.listen(this.category, 'change', () => this.showCategory());
    app.listen(document, 'mf-render-room', () => this.syncStatus());
  }
  showCategory() {
    this.buttons.forEach((button, index) => {
      button.hidden = Math.floor(index / 5) !== Number(this.category.value);
    });
  }
  async choose(item) {
    const {app} = this;
    const current = app.adapter.state.displaySettings || {};
    const initialView = app.scene?.mode !== '3d';
    if (current.renderRoomId !== item.n) {
      this.apply({renderRoomId:item.n});
    }
    if (!app.scene.renderRooms) return;
    try {
      await app.scene.renderRooms.waitReady();
      if (app.adapter.state.displaySettings?.renderRoomId !== item.n || !app.scene.renderRooms.room) return;
      if (matchMedia('(max-width:760px)').matches) this.element.closest('#planner-room-settings').open = false;
      if (initialView) app.scene.fitRenderRoom();
      app.paintMode();
    } catch { this.syncStatus(); }
  }
  syncStatus() {
    const room = roomById(this.app.adapter.state.displaySettings?.renderRoomId);
    this.status.textContent = !room ? '' : (this.app.scene?.isFallback ? 'Для просмотра отделки нужен режим 3D.' : '');
    this.status.hidden = !this.status.textContent;
  }
  sync(settings) {
    const room = roomById(settings.renderRoomId);
    this.roomName.textContent = room?.name || '';
    this.roomName.hidden = !room;
    if (room && room.n !== this.selected) {
      this.category.value = String(Math.floor((room.n - 1) / 5));
      this.showCategory();
    }
    this.selected = room?.n || null;
    this.buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index + 1 === this.selected)));
    this.reset.hidden = !room;
    this.actions.hidden = !this.app.adapter.items.length || Boolean(this.app.scene?.isFallback);
    const query = new URLSearchParams({room: String(this.selected || 1), floor: settings.floorMaterial});
    this.studio.href = '/render-rooms?' + query;
    this.syncStatus();
    return Boolean(room);
  }
}
