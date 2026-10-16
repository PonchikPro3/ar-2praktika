import { MODELS } from './models.js';

export class UI {
  constructor() {
    this.elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
    this.ready = this.supported = this.busy = false;
    this.state = { active: false, starting: false, placed: false, canPlace: false };
    for (const [id, name] of Object.entries(MODELS)) this.elements['model-select'].add(new Option(name, id));
  }

  text(id, message) {
    if (this.elements[id].textContent !== message) this.elements[id].textContent = message;
  }

  render(state = this.state) {
    this.state = state;
    const el = this.elements;
    document.body.classList.toggle('ar', state.active);
    el['ar-hud'].hidden = !state.active;
    el['start-ar'].disabled = !this.ready || !this.supported || state.starting;
    el.place.hidden = state.placed;
    el.place.disabled = !state.canPlace || this.busy;
    el.reset.hidden = !state.placed;
    el['rotate-left'].disabled = el['rotate-right'].disabled = this.busy;
    this.text('ar-status', state.placed ? 'Модель размещена. Можно менять её и поворачивать.'
      : state.canPlace ? 'Коснитесь экрана, чтобы поставить модель.'
        : 'Направьте камеру на пол или стол и медленно двигайте телефон.');
  }

  loading(busy, message = '') {
    this.busy = busy;
    this.elements['model-select'].setAttribute('aria-busy', String(busy));
    this.text('model-status', message);
    this.render();
  }

  error(error) {
    const message = error.name === 'NotAllowedError' ? 'Доступ к AR отклонён. Разрешите камеру и повторите.'
      : 'Не удалось запустить AR. Нужны WebXR AR, hit-test, local-floor и экранные элементы управления.';
    this.text('support', message);
    if (this.state.active) this.text('model-status', message);
    console.error(error);
  }
}
