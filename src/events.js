import { MODELS } from './models.js';

export function bindEvents(ui, ar, models) {
  const el = ui.elements;
  el['start-ar'].addEventListener('click', () => ar.start(el.overlay));
  el['end-ar'].addEventListener('click', () => ar.end());
  el.place.addEventListener('click', () => { ar.placeRequested = true; });
  el.reset.addEventListener('click', () => ar.reset());
  el['rotate-left'].addEventListener('click', () => models.rotate(-Math.PI / 12));
  el['rotate-right'].addEventListener('click', () => models.rotate(Math.PI / 12));
  let selection = 0;
  el['model-select'].addEventListener('change', async () => {
    const request = ++selection;
    const id = el['model-select'].value;
    ui.loading(true, `Загружаем ${MODELS[id]}…`);
    try {
      if (await models.select(id)) ui.loading(false, `${MODELS[id]} готова`);
    } catch (error) {
      if (request !== selection) return;
      el['model-select'].value = models.currentId;
      ui.loading(false, 'Не удалось загрузить модель. Попробуйте выбрать её снова.');
      console.error(error);
    }
  });
  // Consume XR selection on buttons, select, labels AND gaps within the panel.
  // Elsewhere the screen passes through taps for surface placement.
  el.overlay.addEventListener('beforexrselect', (event) => {
    if (event.target.closest('[data-ui]')) event.preventDefault();
  });
}
