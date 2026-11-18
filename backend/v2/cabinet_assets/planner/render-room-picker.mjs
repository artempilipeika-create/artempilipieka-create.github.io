import {roomSettings} from './room-state.mjs';
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
    this.summary = element('button', 'Комнаты для рендера');
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
    const label = element('label', 'Категория комнаты');
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
      image.src = '/account/planner/render-rooms/' + String(item.n).padStart(2, '0') + '.webp';
      button.append(image, element('span', item.name));
      button.hidden = index >= 5;
      app.listen(button, 'click', () => this.choose(item));
      this.cards.append(button);
      return button;
    });
    this.status = element('p');
    this.status.setAttribute('role', 'status');
    this.reset = element('button', 'Вернуться в комнату проекта');
    this.reset.type = 'button';
    app.listen(this.reset, 'click', () => apply({renderRoomId: null}));
    this.png = element('button', 'Картинка для клиента');
    this.png.type = 'button';
    app.listen(this.png, 'click', () => app.presentation?.open({clean: true}));
    this.studio = element('a', 'Открыть студию GLB / OBJ');
    this.studio.target = '_blank';
    this.studio.rel = 'noopener';
    options.append(label, this.cards, this.status, this.png, this.reset, this.studio);
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
    if (current.renderRoomId !== item.n) {
      const previousFloor = roomSettings(current).floorMaterial;
      const floorMaterial = ['marble', 'oak'].includes(previousFloor) ? previousFloor : item.floor;
      this.apply({renderRoomId: item.n, floorMaterial});
    } else if (app.scene.renderRooms?.error) {
      app.scene.renderRooms.select(item.n, true);
    }
    if (!app.scene.renderRooms) return;
    try {
      await app.scene.renderRooms.waitReady();
      if (app.adapter.state.displaySettings?.renderRoomId !== item.n || !app.scene.renderRooms.room) return;
      if (matchMedia('(max-width:760px)').matches) this.element.closest('#planner-room-settings').open = false;
      app.scene.fitRenderRoom();
      app.paintMode();
    } catch { this.syncStatus(); }
  }
  syncStatus() {
    const room = roomById(this.app.adapter.state.displaySettings?.renderRoomId);
    const viewer = this.app.scene?.renderRooms;
    this.status.textContent = !room ? '' : viewer?.error ||
      (this.app.scene?.isFallback ? 'Для просмотра комнаты нужен режим 3D.' : viewer?.room?.item.n === room.n ? '' : 'Загрузка комнаты…');
    this.status.hidden = !this.status.textContent;
  }
  sync(settings) {
    const room = roomById(settings.renderRoomId);
    this.summary.textContent = room ? 'Комнаты для рендера · ' + room.name : 'Комнаты для рендера';
    if (room && room.n !== this.selected) {
      this.category.value = String(Math.floor((room.n - 1) / 5));
      this.showCategory();
    }
    this.selected = room?.n || null;
    this.buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index + 1 === this.selected)));
    this.reset.hidden = !room;
    this.png.hidden = !room || !this.app.adapter.items.length || this.app.scene?.isFallback;
    const query = new URLSearchParams({room: String(this.selected || 1), floor: settings.floorMaterial === 'marble' ? 'marble' : 'oak'});
    this.studio.href = '/render-rooms?' + query;
    this.syncStatus();
    return Boolean(room);
  }
}
