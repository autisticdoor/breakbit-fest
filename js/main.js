// BREAKBIT FEST — скрипты сайта.
// Bootstrap отвечает за меню, модальные окна, вкладки, аккордеон, карусель и toast.
// Здесь только то, чего в Bootstrap нет: формы, фильтр артистов, «Мой лайнап»,
// обратный отсчёт, календарь, расчёт билетов и полоса прокрутки.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ---------- Безопасная работа с localStorage ----------

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* хранилище недоступно — сайт продолжает работать без сохранения */
  }
}

// ---------- Toast и alert ----------

function showToast(text) {
  const element = $('#siteToast');
  if (!element) return;
  $('#siteToastText').textContent = text;
  bootstrap.Toast.getOrCreateInstance(element, { delay: 4000 }).show();
}

let alertTimer;
function showAlert(id, text) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = text;
  box.classList.remove('d-none');
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => box.classList.add('d-none'), 6000);
}

// ---------- Фича 5: полоса прогресса прокрутки и кнопка «наверх» ----------

(function initScrollUi() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'Наверх');
  toTop.textContent = '↑';
  document.body.appendChild(toTop);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  let ticking = false;
  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    // На коротких страницах полоса скрывается
    bar.style.display = max > 200 ? '' : 'none';
    bar.style.transform = 'scaleX(' + Math.min(1, ratio) + ')';
    toTop.classList.toggle('to-top--visible', window.scrollY > 600);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// ---------- Фича 2: обратный отсчёт до начала фестиваля ----------

(function initCountdown() {
  const box = $('#countdown');
  if (!box) return;

  const target = new Date(box.dataset.target).getTime();
  const units = {
    days: $('[data-unit="days"]', box),
    hours: $('[data-unit="hours"]', box),
    minutes: $('[data-unit="minutes"]', box),
    seconds: $('[data-unit="seconds"]', box),
  };

  function tick() {
    const left = target - Date.now();
    if (left <= 0) {
      box.classList.add('countdown--done');
      box.textContent = 'Фестиваль уже начался!';
      clearInterval(timer);
      return;
    }
    const seconds = Math.floor(left / 1000);
    units.days.textContent = Math.floor(seconds / 86400);
    units.hours.textContent = String(Math.floor((seconds % 86400) / 3600)).padStart(2, '0');
    units.minutes.textContent = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    units.seconds.textContent = String(seconds % 60).padStart(2, '0');
  }

  const timer = setInterval(tick, 1000);
  tick();
})();

// ---------- Фича 1: «Мой лайнап» (избранные артисты) ----------

const FAV_KEY = 'bb_favs';
let favs = loadJSON(FAV_KEY, []);
const artistsData = window.BB_ARTISTS || [];

function renderFavs() {
  $$('[data-fav]').forEach((button) => {
    const active = favs.includes(button.dataset.fav);
    button.setAttribute('aria-pressed', String(active));
    const text = $('[data-fav-text]', button);
    if (text) text.textContent = active ? 'В моём лайнапе' : 'В мой лайнап';
  });
  $$('[data-fav-count]').forEach((badge) => { badge.textContent = favs.length; });
  renderMyLineup();
}

function renderMyLineup() {
  const list = $('#my-list');
  if (!list) return;
  const chosen = artistsData
    .filter((artist) => favs.includes(artist.slug))
    .sort((a, b) => a.start.localeCompare(b.start));

  list.innerHTML = '';
  chosen.forEach((artist) => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between align-items-center gap-3';
    const link = document.createElement('a');
    link.href = artist.url;
    link.className = 'text-white';
    link.textContent = artist.name;
    const when = document.createElement('span');
    when.className = 'small opacity-75 text-end';
    when.textContent = artist.dayName + ', ' + artist.start.slice(11) + '–' + artist.end.slice(11);
    item.append(link, when);
    list.appendChild(item);
  });

  $('#my-empty').classList.toggle('d-none', chosen.length > 0);
  $('#my-ics').disabled = chosen.length === 0;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-fav]');
  if (!button) return;
  const slug = button.dataset.fav;
  const artist = artistsData.find((item) => item.slug === slug);
  if (favs.includes(slug)) {
    favs = favs.filter((item) => item !== slug);
    showToast((artist ? artist.name : 'Артист') + ' убран из «Моего лайнапа».');
  } else {
    favs.push(slug);
    showToast((artist ? artist.name : 'Артист') + ' добавлен в «Мой лайнап».');
  }
  saveJSON(FAV_KEY, favs);
  renderFavs();
});

// ---------- Фича 4: добавить в календарь (.ics) ----------

function icsDate(localIso) {
  // Время фестиваля — московское (UTC+3), в календарь записываем в UTC
  return new Date(localIso + ':00+03:00').toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function downloadCalendar(events, fileName) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BREAKBIT FEST//RU', 'CALSCALE:GREGORIAN'];
  events.forEach((item, index) => {
    lines.push(
      'BEGIN:VEVENT',
      'UID:breakbit-' + index + '-' + icsDate(item.start) + '@breakbit.example',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART:' + icsDate(item.start),
      'DTEND:' + icsDate(item.end),
      'SUMMARY:' + icsEscape(item.title),
      'LOCATION:' + icsEscape('Москва, Нагатинская набережная, площадка «Дельта»'),
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-ics]');
  if (!button) return;

  if (button.dataset.ics === 'festival') {
    downloadCalendar([{ title: 'BREAKBIT FEST 2027', start: '2027-07-16T14:00', end: '2027-07-18T23:30' }], 'breakbit-fest.ics');
    showToast('Файл календаря скачан.');
  } else {
    const events = artistsData
      .filter((artist) => favs.includes(artist.slug))
      .map((artist) => ({ title: artist.name + ' — BREAKBIT FEST', start: artist.start, end: artist.end }));
    if (events.length) {
      downloadCalendar(events, 'my-breakbit-lineup.ics');
      showToast('Мой лайнап сохранён в календарь.');
    }
  }
});

// ---------- Проверка форм ----------

$$('.needs-validation').forEach((form) => {
  form.addEventListener('submit', (event) => {
    // Сервера пока нет, поэтому стандартную отправку отменяем
    event.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      const firstInvalid = $(':invalid', form);
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Форма бронирования билета обрабатывается отдельно (ниже)
    if (form.id === 'order-form') return;

    const text = form.dataset.successText || 'Готово!';
    if (form.dataset.alert) {
      showAlert(form.dataset.alert, text);
    } else {
      showToast(text);
    }

    const modalElement = form.closest('.modal');
    form.reset();
    form.classList.remove('was-validated');
    if (modalElement) bootstrap.Modal.getInstance(modalElement).hide();
  });

  form.addEventListener('reset', () => form.classList.remove('was-validated'));
});

// ---------- Модальное окно напоминания (страница артиста) ----------

const remindModal = $('#remindModal');
if (remindModal) {
  remindModal.addEventListener('show.bs.modal', (event) => {
    const trigger = event.relatedTarget;
    if (trigger && trigger.dataset.artist) $('#remind-artist').textContent = trigger.dataset.artist;
  });
}

// ---------- Страница артистов: фильтры, поиск, сортировка ----------

(function initArtists() {
  const list = $('#artistList');
  if (!list) return;

  const items = $$('.artist-item', list);
  const search = $('#artist-search');
  const daySelect = $('#artist-day');
  const sortSelect = $('#artist-sort');
  const genreButtons = $$('#genreFilter button');
  const count = $('#artist-count');
  const empty = $('#artist-empty');
  const dayOrder = { fri: 0, sat: 1, sun: 2 };

  const state = { genre: 'all', day: 'all', sort: 'day', q: '' };

  // Начальное состояние берём из адреса: ?genre=breakcore&day=sat&sort=name&q=awp
  const params = new URLSearchParams(window.location.search);
  if (params.get('genre')) state.genre = params.get('genre');
  if (params.get('day')) state.day = params.get('day');
  if (params.get('sort')) state.sort = params.get('sort');
  if (params.get('q')) state.q = params.get('q');

  function writeUrl() {
    const next = new URLSearchParams();
    if (state.genre !== 'all') next.set('genre', state.genre);
    if (state.day !== 'all') next.set('day', state.day);
    if (state.sort !== 'day') next.set('sort', state.sort);
    if (state.q) next.set('q', state.q);
    const query = next.toString();
    history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }

  function apply() {
    const query = state.q.trim().toLowerCase();
    let visible = 0;

    items.forEach((item) => {
      const genres = item.dataset.genres.split(' ');
      const show =
        (state.genre === 'all' || genres.includes(state.genre)) &&
        (state.day === 'all' || item.dataset.day === state.day) &&
        item.dataset.name.includes(query);
      item.classList.toggle('d-none', !show);
      if (show) visible++;
    });

    // Сортировка: по дням фестиваля или по алфавиту
    const sorted = [...items].sort((a, b) => {
      if (state.sort === 'name') return a.dataset.name.localeCompare(b.dataset.name);
      return dayOrder[a.dataset.day] - dayOrder[b.dataset.day] || a.dataset.order - b.dataset.order;
    });
    sorted.forEach((item) => list.appendChild(item));

    genreButtons.forEach((button) => {
      const active = button.dataset.genre === state.genre;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    });
    search.value = state.q;
    daySelect.value = state.day;
    sortSelect.value = state.sort;
    count.textContent = 'Найдено артистов: ' + visible;
    empty.classList.toggle('d-none', visible > 0);
    writeUrl();
  }

  genreButtons.forEach((button) => button.addEventListener('click', () => { state.genre = button.dataset.genre; apply(); }));
  daySelect.addEventListener('change', () => { state.day = daySelect.value; apply(); });
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; apply(); });
  search.addEventListener('input', () => { state.q = search.value; apply(); });
  $('#artist-reset').addEventListener('click', () => {
    Object.assign(state, { genre: 'all', day: 'all', sort: 'day', q: '' });
    apply();
  });

  apply();
})();

// ---------- Расписание: открыть день из адреса (#pane-sat) ----------

(function initScheduleHash() {
  const tabs = $('#dayTabs');
  if (!tabs) return;
  const day = new URLSearchParams(window.location.search).get('day');
  const button = day && $('#tab-' + day);
  if (button) bootstrap.Tab.getOrCreateInstance(button).show();
})();

// ---------- Страница билетов: расчёт, промокод, электронный билет ----------

(function initTickets() {
  const form = $('#order-form');
  if (!form) return;

  const category = $('#order-category');
  const qty = $('#order-qty');
  const promo = $('#order-promo');
  const PROMO = { BREAK10: 0.1 };
  let discount = 0;

  const money = (value) => value.toLocaleString('ru-RU') + ' ₽';

  function clampQty() {
    let value = parseInt(qty.value, 10);
    if (Number.isNaN(value)) value = 1;
    return Math.min(6, Math.max(1, value));
  }

  function update() {
    const option = category.selectedOptions[0];
    const price = Number(option.dataset.price) || 0;
    const count = clampQty();
    const subtotal = price * count;
    const off = Math.round(subtotal * discount);

    $('#sum-category').textContent = option.dataset.name || 'не выбрана';
    $('#sum-qty').textContent = count;
    $('#sum-subtotal').textContent = money(subtotal);
    $('#sum-discount').textContent = '−' + money(off);
    $('#sum-discount-row').classList.toggle('d-none', off === 0);
    $('#sum-total').textContent = money(subtotal - off);
    return { name: option.dataset.name || '', count, total: subtotal - off };
  }

  $('#qty-minus').addEventListener('click', () => { qty.value = Math.max(1, clampQty() - 1); update(); });
  $('#qty-plus').addEventListener('click', () => { qty.value = Math.min(6, clampQty() + 1); update(); });
  qty.addEventListener('input', update);
  category.addEventListener('change', update);

  // Кнопки «Выбрать» на карточках тарифов
  $$('[data-choose]').forEach((button) => button.addEventListener('click', () => {
    category.value = button.dataset.choose;
    update();
    $('#booking').scrollIntoView({ behavior: 'smooth' });
    category.focus({ preventScroll: true });
  }));

  // Тариф можно передать в адресе: tickets.html?category=vip
  const wanted = new URLSearchParams(window.location.search).get('category');
  if (wanted) category.value = wanted;

  // Промокод
  $('#promo-apply').addEventListener('click', () => {
    const code = promo.value.trim().toUpperCase();
    promo.classList.remove('is-valid', 'is-invalid');
    if (!code) { discount = 0; update(); return; }
    if (PROMO[code]) {
      discount = PROMO[code];
      promo.classList.add('is-valid');
    } else {
      discount = 0;
      promo.classList.add('is-invalid');
    }
    update();
  });

  form.addEventListener('reset', () => {
    discount = 0;
    promo.classList.remove('is-valid', 'is-invalid');
    setTimeout(update);
  });

  // Отправка: создаём номер заказа и показываем электронный билет
  form.addEventListener('submit', (event) => {
    if (!form.checkValidity()) return; // ошибки уже показал общий обработчик
    const order = update();
    const number = 'BB-' + Date.now().toString(36).toUpperCase().slice(-6);

    $('#t-number').textContent = number;
    $('#t-name').textContent = $('#order-name').value.trim();
    $('#t-category').textContent = order.name;
    $('#t-qty').textContent = order.count + ' шт.';
    $('#t-total').textContent = money(order.total);

    const orders = loadJSON('bb_orders', []);
    orders.push({ number, category: order.name, qty: order.count, total: order.total });
    saveJSON('bb_orders', orders);

    bootstrap.Modal.getOrCreateInstance($('#ticketModal')).show();
    showAlert('pageAlert', 'Заявка отправлена! Номер заказа: ' + number + '.');
    form.reset();
    form.classList.remove('was-validated');
    $('#order-qty').value = 1;
    discount = 0;
    update();
  });

  $('#ticket-print').addEventListener('click', () => window.print());
  update();
})();

// Запускаем отрисовку избранного после того, как все обработчики готовы
renderFavs();
