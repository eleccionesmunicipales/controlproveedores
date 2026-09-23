const STORAGE_KEY = 'control-retiros-proveedores-v1';
const SESSION_KEY = 'control-retiros-proveedores-session';
const LOGIN_USER = 'admin';
const LOGIN_PASSWORD = 'admin123';

const state = loadState();

const $ = (selector) => document.querySelector(selector);
const loginScreen = $('#loginScreen');
const appShell = $('#appShell');
const loginForm = $('#loginForm');
const retiroForm = $('#retiroForm');
const pagoForm = $('#pagoForm');

const formatMoney = (value) => `Gs. ${Math.round(value || 0).toLocaleString('es-PY')}`;
const normalizeProvider = (value) => value.trim().replace(/\s+/g, ' ');
const byDate = (a, b) => (a.fecha || '').localeCompare(b.fecha || '');

function loadState() {
  const fallback = { settings: {}, retiros: [], pagos: [] };
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showApp(isLoggedIn) {
  loginScreen.hidden = isLoggedIn;
  appShell.hidden = !isLoggedIn;
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = formValues(loginForm);
  const isValid = data.usuario.trim() === LOGIN_USER && data.clave === LOGIN_PASSWORD;
  $('#loginError').hidden = isValid;
  if (!isValid) return;
  sessionStorage.setItem(SESSION_KEY, '1');
  loginForm.reset();
  showApp(true);
});

$('#logout').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  showApp(false);
});

function setTodayDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  retiroForm.elements.fecha.value = today;
  pagoForm.elements.fecha.value = today;
  if (!$('#fechaInicio').value) $('#fechaInicio').value = today;
  if (!$('#mesAnio').value) $('#mesAnio').value = today.slice(0, 7);
}

function bindSettings() {
  ['responsableGeneral', 'lugar', 'mesAnio', 'fechaInicio'].forEach((id) => {
    const input = $(`#${id}`);
    input.value = state.settings[id] || input.value || '';
    input.addEventListener('input', () => {
      state.settings[id] = input.value;
      saveState();
    });
  });
}

retiroForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = formValues(retiroForm);
  const retiro = {
    id: crypto.randomUUID(),
    proveedor: normalizeProvider(data.proveedor),
    telefono: data.telefono.trim(),
    fecha: data.fecha,
    semana: Number(data.semana),
    concepto: data.concepto.trim(),
    cantidad: Number(data.cantidad),
    unidad: data.unidad.trim(),
    precio: Number(data.precio),
    destino: data.destino.trim(),
    responsable: data.responsable.trim(),
    comprobante: data.comprobante.trim()
  };
  retiro.total = retiro.cantidad * retiro.precio;
  state.retiros.push(retiro);
  saveState();
  retiroForm.reset();
  setTodayDefaults();
  render();
});

pagoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = formValues(pagoForm);
  state.pagos.push({
    id: crypto.randomUUID(),
    fecha: data.fecha,
    proveedor: normalizeProvider(data.proveedor),
    monto: Number(data.monto),
    forma: data.forma.trim(),
    comprobante: data.comprobante.trim(),
    observacion: data.observacion.trim()
  });
  saveState();
  pagoForm.reset();
  setTodayDefaults();
  render();
});

$('#printPage').addEventListener('click', () => window.print());
$('#clearData').addEventListener('click', () => {
  if (!confirm('Seguro que queres borrar todos los retiros y pagos cargados?')) return;
  state.retiros = [];
  state.pagos = [];
  saveState();
  render();
});

$('#exportCsv').addEventListener('click', () => {
  const rows = [
    ['tipo', 'fecha', 'semana', 'proveedor', 'concepto_observacion', 'cantidad', 'unidad', 'precio_unitario', 'monto_total', 'destino_forma', 'responsable_comprobante']
  ];

  state.retiros.forEach((item) => rows.push([
    'retiro', item.fecha, item.semana, item.proveedor, item.concepto, item.cantidad, item.unidad, item.precio, item.total, item.destino, item.responsable || item.comprobante
  ]));

  state.pagos.forEach((item) => rows.push([
    'pago', item.fecha, '', item.proveedor, item.observacion, '', '', '', item.monto, item.forma, item.comprobante
  ]));

  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `control-retiros-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function summaries() {
  const providers = new Map();

  state.retiros.forEach((item) => {
    const row = providers.get(item.proveedor) || { proveedor: item.proveedor, retiros: 0, pagos: 0, ultimo: '' };
    row.retiros += item.total;
    row.ultimo = [row.ultimo, item.fecha].sort().at(-1);
    providers.set(item.proveedor, row);
  });

  state.pagos.forEach((item) => {
    const row = providers.get(item.proveedor) || { proveedor: item.proveedor, retiros: 0, pagos: 0, ultimo: '' };
    row.pagos += item.monto;
    row.ultimo = [row.ultimo, item.fecha].sort().at(-1);
    providers.set(item.proveedor, row);
  });

  return [...providers.values()].map((row) => ({ ...row, saldo: row.retiros - row.pagos }))
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor));
}

function weeklySummaries() {
  const weeks = new Map();
  const keyFor = (semana, proveedor) => `${semana}::${proveedor}`;

  state.retiros.forEach((item) => {
    const key = keyFor(item.semana, item.proveedor);
    const row = weeks.get(key) || { semana: item.semana, proveedor: item.proveedor, retiros: 0, pagos: 0 };
    row.retiros += item.total;
    weeks.set(key, row);
  });

  state.pagos.forEach((item) => {
    const retiroCercano = state.retiros.find((retiro) => retiro.proveedor === item.proveedor && retiro.fecha <= item.fecha);
    const semana = retiroCercano?.semana || weekNumber(item.fecha);
    const key = keyFor(semana, item.proveedor);
    const row = weeks.get(key) || { semana, proveedor: item.proveedor, retiros: 0, pagos: 0 };
    row.pagos += item.monto;
    weeks.set(key, row);
  });

  return [...weeks.values()].map((row) => ({ ...row, saldo: row.retiros - row.pagos }))
    .sort((a, b) => a.semana - b.semana || a.proveedor.localeCompare(b.proveedor));
}

function weekNumber(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - start) / 86400000) + start.getDay() + 1) / 7);
}

function providerBalanceAfterPayment(payment) {
  const movimientos = [
    ...state.retiros.filter((item) => item.proveedor === payment.proveedor).map((item) => ({ fecha: item.fecha, value: item.total })),
    ...state.pagos.filter((item) => item.proveedor === payment.proveedor).map((item) => ({ fecha: item.fecha, value: -item.monto, id: item.id }))
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  let saldo = 0;
  for (const movimiento of movimientos) {
    saldo += movimiento.value;
    if (movimiento.id === payment.id) return saldo;
  }
  return saldo;
}

function render() {
  renderResumen();
  renderSemanal();
  renderRetiros();
  renderPagos();
}

function renderResumen() {
  const data = summaries();
  $('#totalPendiente').textContent = formatMoney(data.reduce((sum, row) => sum + row.saldo, 0));
  renderRows('#resumenBody', data, 5, (row) => `
    <tr>
      <td>${escapeHtml(row.proveedor)}</td>
      <td class="money">${formatMoney(row.retiros)}</td>
      <td class="money">${formatMoney(row.pagos)}</td>
      <td class="money ${row.saldo < 0 ? 'negative' : ''}">${formatMoney(row.saldo)}</td>
      <td>${row.ultimo || '-'}</td>
    </tr>`);
}

function renderSemanal() {
  renderRows('#semanalBody', weeklySummaries(), 5, (row) => `
    <tr>
      <td>Semana ${row.semana}</td>
      <td>${escapeHtml(row.proveedor)}</td>
      <td class="money">${formatMoney(row.retiros)}</td>
      <td class="money">${formatMoney(row.pagos)}</td>
      <td class="money ${row.saldo < 0 ? 'negative' : ''}">${formatMoney(row.saldo)}</td>
    </tr>`);
}

function renderRetiros() {
  renderRows('#retirosBody', [...state.retiros].sort(byDate), 10, (item) => `
    <tr>
      <td>${item.fecha}</td>
      <td>${escapeHtml(item.proveedor)}</td>
      <td>${escapeHtml(item.concepto)}</td>
      <td>${item.cantidad}</td>
      <td>${escapeHtml(item.unidad)}</td>
      <td class="money">${formatMoney(item.precio)}</td>
      <td class="money">${formatMoney(item.total)}</td>
      <td>${escapeHtml(item.destino)}</td>
      <td>${escapeHtml(item.responsable)}</td>
      <td><button class="row-action" data-delete-retiro="${item.id}">Borrar</button></td>
    </tr>`);
}

function renderPagos() {
  renderRows('#pagosBody', [...state.pagos].sort(byDate), 8, (item) => `
    <tr>
      <td>${item.fecha}</td>
      <td>${escapeHtml(item.proveedor)}</td>
      <td class="money">${formatMoney(item.monto)}</td>
      <td>${escapeHtml(item.forma)}</td>
      <td>${escapeHtml(item.comprobante)}</td>
      <td>${escapeHtml(item.observacion)}</td>
      <td class="money">${formatMoney(providerBalanceAfterPayment(item))}</td>
      <td><button class="row-action" data-delete-pago="${item.id}">Borrar</button></td>
    </tr>`);
}

function renderRows(selector, rows, colspan, template) {
  const body = $(selector);
  body.innerHTML = rows.length ? rows.map(template).join('') : `<tr><td colspan="${colspan}" class="empty">Todavia no hay datos cargados.</td></tr>`;
}

document.addEventListener('click', (event) => {
  const retiroId = event.target.dataset.deleteRetiro;
  const pagoId = event.target.dataset.deletePago;
  if (retiroId) state.retiros = state.retiros.filter((item) => item.id !== retiroId);
  if (pagoId) state.pagos = state.pagos.filter((item) => item.id !== pagoId);
  if (retiroId || pagoId) {
    saveState();
    render();
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

bindSettings();
setTodayDefaults();
render();
showApp(sessionStorage.getItem(SESSION_KEY) === '1');
