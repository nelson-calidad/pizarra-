// ============================================================
// Mi Tablero — Google Apps Script
// Hojas: NOTAS | CHECKLIST | PERSONAS | ACTIVIDAD | ETIQUETAS | CONFIG
// ============================================================

const HEADERS = {
  NOTAS: [
    'ID','TEXTO','DESCRIPCION','ESTADO','FECHA','HORA',
    'CATEGORIA','PRIORIDAD','RESPONSABLE','COLOR','FIJADA',
    'X','Y','ANCHO','ALTO','CREADO_EN','ACTUALIZADO_EN',
    'COMPLETADO_EN','ARCHIVADO','RECORDATORIO','REPETICION','ORDEN','TIPO'
  ],
  CHECKLIST: ['ID','NOTA_ID','TEXTO','COMPLETADO','ORDEN'],
  PERSONAS:  ['ID','NOMBRE','ACTIVO','ORDEN','CREADO_EN','ACTUALIZADO_EN'],
  ACTIVIDAD: ['ID','NOTA_ID','ACCION','DETALLE','ANTES','DESPUES','ACTOR','CREADO_EN'],
  ETIQUETAS: ['ID','NOMBRE','COLOR'],
  CONFIG:    ['CLAVE','VALOR']
};

// ---- HTTP handlers ----

function doGet(e) {
  return jsonResponse_(route_(e.parameter || {}));
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData ? e.postData.contents : '{}');
    return jsonResponse_(route_(body));
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Router ----

function route_(p) {
  try {
    const a = p.action;
    if (a === 'setupSpreadsheet')  return { success: true, data: setupSpreadsheet(), message: 'Hojas preparadas' };
    
    // NOTAS
    if (a === 'getNotes')   return { success: true, data: readAll_('NOTAS') };
    if (a === 'getNote')    return { success: true, data: readAll_('NOTAS').find(n => n.ID === p.id) || null };
    if (a === 'createNote') return createNote_(p.data || {});
    if (a === 'updateNote' || a === 'moveNote') return update_('NOTAS', p.id, p.data || {});
    if (a === 'deleteNote') return del_('NOTAS', p.id);
    if (a === 'archiveNote') return update_('NOTAS', p.id, { ESTADO: 'ARCHIVADO', ARCHIVADO: true });
    if (a === 'completeNote') return update_('NOTAS', p.id, { ESTADO: 'HECHO', COMPLETADO_EN: new Date().toISOString() });
    if (a === 'reopenNote')   return update_('NOTAS', p.id, { ESTADO: 'PENDIENTE', COMPLETADO_EN: '' });

    // PERSONAS
    if (a === 'getPeople')    return { success: true, data: readAll_('PERSONAS').filter(p => p.ACTIVO !== false && p.ACTIVO !== 'FALSE') };
    if (a === 'createPerson') return createPerson_(p.data || {});
    if (a === 'updatePerson') return update_('PERSONAS', p.id, p.data || {});
    if (a === 'deletePerson') return update_('PERSONAS', p.id, { ACTIVO: false });
    
    // ACTIVIDAD
    if (a === 'getActivity') {
      let rows = readAll_('ACTIVIDAD');
      if (p.noteId) rows = rows.filter(r => r.NOTA_ID === p.noteId);
      return { success: true, data: rows.slice(-100) };
    }
    if (a === 'createActivity') return createActivity_(p.data || {});

    // CHECKLIST
    if (a === 'getChecklist') return { success: true, data: readAll_('CHECKLIST').filter(r => r.NOTA_ID === p.noteId) };
    if (a === 'createChecklistItem') return createChecklistItem_(p.data || {});
    if (a === 'updateChecklistItem') return update_('CHECKLIST', p.id, p.data || {});
    if (a === 'deleteChecklistItem') return del_('CHECKLIST', p.id);

    // ETIQUETAS
    if (a === 'getTags') return { success: true, data: readAll_('ETIQUETAS') };

    return { success: false, error: 'Acción no reconocida: ' + a };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---- Setup / Migración ----

function setupSpreadsheet() {
  const s = SpreadsheetApp.getActive();
  const created = [];
  Object.keys(HEADERS).forEach(name => {
    let sh = s.getSheetByName(name);
    if (!sh) {
      sh = s.insertSheet(name);
      sh.appendRow(HEADERS[name]);
      created.push(name + ' (nueva)');
    } else {
      const added = ensureSheetHeaders_(sh, HEADERS[name]);
      if (added.length) created.push(name + ': +' + added.join(','));
    }
  });
  initPeople_();
  return created.length ? created : ['Sin cambios'];
}

// Agrega columnas faltantes al FINAL de la hoja, sin tocar los datos existentes.
function ensureSheetHeaders_(sheet, requiredHeaders) {
  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const toAdd = requiredHeaders.filter(h => !existing.includes(h));
  toAdd.forEach(h => {
    const col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(h);
  });
  return toAdd;
}

function initPeople_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('PERSONAS');
  if (!sh) return;
  // Solo inicializar si está vacía (sin datos)
  if (sh.getLastRow() > 1) return;
  const now = new Date().toISOString();
  const defaults = ['Nelson', 'Melisa Condori', 'Equipo'];
  defaults.forEach((name, i) => {
    sh.appendRow([Utilities.getUuid(), name, true, i, now, now]);
  });
}

// ---- Sheet utils ----

function getSheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Hoja no encontrada: ' + name + '. Ejecutá setupSpreadsheet primero.');
  return sh;
}

function readAll_(name) {
  const sh = getSheet_(name);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  return rows.slice(1).map(row =>
    headers.reduce((obj, key, i) => { obj[key] = row[i]; return obj; }, {})
  );
}

function appendRow_(name, obj) {
  const sh = getSheet_(name);
  // Leer headers actuales del sheet (pueden tener más columnas que HEADERS por migración)
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(k => obj[k] !== undefined ? obj[k] : ''));
}

// ---- CRUD genérico ----

function update_(name, id, data) {
  const sh = getSheet_(name);
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(String);
  const rowIdx = all.findIndex((row, i) => i > 0 && String(row[0]) === String(id));
  if (rowIdx < 1) return { success: false, error: 'Registro no encontrado: ' + id };
  data.ACTUALIZADO_EN = data.ACTUALIZADO_EN || new Date().toISOString();
  headers.forEach((key, colIdx) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      sh.getRange(rowIdx + 1, colIdx + 1).setValue(data[key]);
    }
  });
  return { success: true, data: Object.assign({ ID: id }, data), message: 'Actualizado' };
}

function del_(name, id) {
  const sh = getSheet_(name);
  const all = sh.getDataRange().getValues();
  const rowIdx = all.findIndex((row, i) => i > 0 && String(row[0]) === String(id));
  if (rowIdx < 1) return { success: false, error: 'Registro no encontrado: ' + id };
  sh.deleteRow(rowIdx + 1);
  return { success: true, data: { id }, message: 'Eliminado' };
}

// ---- Creadores específicos ----

function createNote_(data) {
  const now = new Date().toISOString();
  const obj = Object.assign({
    ID: Utilities.getUuid(),
    TEXTO: '', DESCRIPCION: '', ESTADO: 'PENDIENTE',
    FECHA: '', HORA: '', CATEGORIA: 'General', PRIORIDAD: 'NORMAL',
    RESPONSABLE: '', COLOR: 'yellow', FIJADA: false,
    X: 120, Y: 120, ANCHO: 264, ALTO: 155,
    CREADO_EN: now, ACTUALIZADO_EN: now,
    COMPLETADO_EN: '', ARCHIVADO: false, RECORDATORIO: false,
    REPETICION: '', ORDEN: 0, TIPO: 'NOTA'
  }, data);
  appendRow_('NOTAS', obj);
  return { success: true, data: obj, message: 'Nota creada' };
}

function createPerson_(data) {
  const now = new Date().toISOString();
  // Verificar duplicados (case-insensitive)
  const existing = readAll_('PERSONAS');
  const name = (data.NOMBRE || '').trim().toLowerCase();
  if (existing.some(p => String(p.NOMBRE).trim().toLowerCase() === name)) {
    return { success: false, error: 'Persona ya existe' };
  }
  const obj = Object.assign({
    ID: Utilities.getUuid(),
    NOMBRE: '', ACTIVO: true, ORDEN: existing.length,
    CREADO_EN: now, ACTUALIZADO_EN: now
  }, data);
  appendRow_('PERSONAS', obj);
  return { success: true, data: obj, message: 'Persona creada' };
}

function createActivity_(data) {
  const obj = Object.assign({
    ID: Utilities.getUuid(),
    NOTA_ID: '', ACCION: '', DETALLE: '',
    ANTES: '', DESPUES: '', ACTOR: '',
    CREADO_EN: new Date().toISOString()
  }, data);
  appendRow_('ACTIVIDAD', obj);
  return { success: true, data: obj };
}

function createChecklistItem_(data) {
  const obj = Object.assign({
    ID: Utilities.getUuid(),
    NOTA_ID: '', TEXTO: '', COMPLETADO: false, ORDEN: 0
  }, data);
  appendRow_('CHECKLIST', obj);
  return { success: true, data: obj };
}
