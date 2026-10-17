// ============================================================
// Mi Tablero & Planificador Operativo de Calidad — Google Apps Script
// Hojas existentes: NOTAS | CHECKLIST | PERSONAS | ACTIVIDAD | ETIQUETAS | CONFIG
// Hojas nuevas:     ACTIVIDADES | EJECUCIONES | EVENTOS
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
  CONFIG:    ['CLAVE','VALOR'],
  ACTIVIDADES: [
    'ID','NOMBRE','DESCRIPCION','FRECUENCIA','INTERVALO',
    'FECHA_INICIO','FECHA_FIN','VIGENTE_DESDE','SOLO_HABILES',
    'SUCURSAL','POR_SUCURSAL','RESPONSABLE','CATEGORIA',
    'TIPO_EVENTO','DESPLAZAMIENTO_DIAS','AVISO_DIAS','ESTADO',
    'NOTA_ORIGEN_ID','CREADO_POR','CREADO_EN','ACTUALIZADO_EN',
    'FLEXIBLE','DIA_INICIO_VENTANA','DIA_FIN_VENTANA',
    'IMPORT_ID','NOTAS','MODO_CUMPLIMIENTO','ACCION_CUMPLIMIENTO'
  ],
  EJECUCIONES: [
    'ID','ACTIVIDAD_ID','PERIODO','SUCURSAL','FECHA',
    'EJECUTOR','ESTADO','OBSERVACION','EVIDENCIA','MOTIVO',
    'COMPLETADO_EN','COMPLETADO_POR','EVENTO_ID',
    'NOMBRE_ACTIVIDAD','CREADO_EN','ACTUALIZADO_EN','INICIO_VENTANA',
    'MODO_CUMPLIMIENTO','ACCION_CUMPLIMIENTO','PARTICIPANTES','CONFIRMACIONES'
  ],
  EVENTOS: [
    'ID','TIPO','TITULO','FECHA','SUCURSAL','ESTADO',
    'NOTAS','CREADO_POR','CREADO_EN','ACTUALIZADO_EN'
  ]
};

// ---- HTTP handlers ----

function doGet(e) {
  return jsonResponse_(route_(e.parameter || {}, false));
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData ? e.postData.contents : '{}');
    return jsonResponse_(route_(body, true));
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Autenticación por clave compartida ----
// Si en la hoja CONFIG existe una fila con CLAVE = 'ACCESS_KEY' y un VALOR no vacío,
// todas las consultas deben enviar `key` coincidente.
// Si ocurre un error de lectura o la clave no coincide, se deniega el acceso por seguridad.

function checkAuth_(p) {
  try {
    const ss = SpreadsheetApp.getActive();
    if (!ss) return false;
    const sh = ss.getSheetByName('CONFIG');
    if (!sh || sh.getLastRow() < 2) return false; // falta CONFIG o no tiene filas
    const rows = sh.getDataRange().getValues();
    const row = rows.find((r, i) => i > 0 && String(r[0]).trim().toUpperCase() === 'ACCESS_KEY');
    if (!row) return false; // falta ACCESS_KEY en CONFIG
    const expected = String(row[1] || '').trim();
    if (!expected) return false; // ACCESS_KEY está vacía
    const received = String(p.key || '').trim();
    return received === expected;
  } catch (err) {
    Logger.log('Error en checkAuth_: ' + err.message);
    return false; // Ante error de evaluación de seguridad, rechazar por defecto
  }
}

// ---- Router ----

function route_(p, isWrite) {
  const lock = isWrite ? LockService.getScriptLock() : null;
  try {
    if (!checkAuth_(p)) {
      return { success: false, code: 401, error: 'NO_AUTORIZADO' };
    }
    if (lock) lock.waitLock(15000);

    const a = p.action;
    if (a === 'setupSpreadsheet') return { success: true, data: setupSpreadsheet(), message: 'Hojas preparadas' };

    // NOTAS (compatibilidad total con versión previa)
    if (a === 'getNotes')     return { success: true, data: readAll_('NOTAS') };
    if (a === 'getNote')      return { success: true, data: readAll_('NOTAS').find(n => n.ID === p.id) || null };
    if (a === 'createNote')   return createNote_(p.data || {});
    if (a === 'updateNote' || a === 'moveNote') return update_('NOTAS', p.id, p.data || {}, true);
    if (a === 'deleteNote')   return del_('NOTAS', p.id);
    if (a === 'archiveNote')  return update_('NOTAS', p.id, { ESTADO: 'ARCHIVADO', ARCHIVADO: true });
    if (a === 'completeNote') return update_('NOTAS', p.id, { ESTADO: 'HECHO', COMPLETADO_EN: new Date().toISOString() });
    if (a === 'reopenNote')   return update_('NOTAS', p.id, { ESTADO: 'PENDIENTE', COMPLETADO_EN: '' });

    // PERSONAS
    if (a === 'getPeople')    return { success: true, data: readAll_('PERSONAS').filter(x => x.ACTIVO !== false && x.ACTIVO !== 'FALSE') };
    if (a === 'createPerson') return createPerson_(p.data || {});
    if (a === 'updatePerson') return update_('PERSONAS', p.id, p.data || {});
    if (a === 'deletePerson') return update_('PERSONAS', p.id, { ACTIVO: false });

    // ACTIVIDAD (historial de cambios)
    if (a === 'getActivity') {
      let rows = readAll_('ACTIVIDAD');
      if (p.noteId) rows = rows.filter(r => r.NOTA_ID === p.noteId);
      return { success: true, data: rows.slice(-150) };
    }
    if (a === 'createActivity') return createActivity_(p.data || {});

    // CHECKLIST
    if (a === 'getChecklist')        return { success: true, data: readAll_('CHECKLIST').filter(r => r.NOTA_ID === p.noteId) };
    if (a === 'createChecklistItem') return createChecklistItem_(p.data || {});
    if (a === 'updateChecklistItem') return update_('CHECKLIST', p.id, p.data || {}, true);
    if (a === 'deleteChecklistItem') return del_('CHECKLIST', p.id);

    // ETIQUETAS
    if (a === 'getTags') return { success: true, data: readAll_('ETIQUETAS') };

    // PLANIFICADOR DE CALIDAD (ACTIVIDADES + EJECUCIONES + EVENTOS)
    if (a === 'getPlanner') {
      ensurePlannerSheets_();
      return {
        success: true,
        data: {
          activities: readAll_('ACTIVIDADES'),
          executions: readAll_('EJECUCIONES'),
          events: readAll_('EVENTOS')
        }
      };
    }

    if (a === 'upsertActivity')   return upsert_('ACTIVIDADES', p.id || (p.data && p.data.ID), p.data || {});
    if (a === 'batchUpsertActivities') return batchUpsertActivities_(p.data || []);
    if (a === 'deleteActivity')   return del_('ACTIVIDADES', p.id);

    if (a === 'upsertExecution')  return upsert_('EJECUCIONES', p.id || (p.data && p.data.ID), p.data || {});
    if (a === 'batchUpsertExecutions') return batchUpsertExecutions_(p.data || []);
    if (a === 'deleteExecution')  return del_('EJECUCIONES', p.id);

    if (a === 'upsertEvent')      return upsert_('EVENTOS', p.id || (p.data && p.data.ID), p.data || {});
    if (a === 'deleteEvent')      return del_('EVENTOS', p.id);

    return { success: false, error: 'Acción no reconocida: ' + a };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

// ---- Setup / Migración no destructiva ----

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

function ensurePlannerSheets_() {
  const s = SpreadsheetApp.getActive();
  ['ACTIVIDADES', 'EJECUCIONES', 'EVENTOS'].forEach(name => {
    let sh = s.getSheetByName(name);
    if (!sh) {
      sh = s.insertSheet(name);
      sh.appendRow(HEADERS[name]);
    } else {
      ensureSheetHeaders_(sh, HEADERS[name]);
    }
  });
}

// Agrega columnas faltantes al FINAL de la hoja, sin tocar los datos existentes.
function ensureSheetHeaders_(sheet, requiredHeaders) {
  if (sheet.getLastColumn() === 0) {
    sheet.appendRow(requiredHeaders);
    return requiredHeaders;
  }
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
  if (!sh || sh.getLastRow() > 1) return;
  const now = new Date().toISOString();
  const defaults = ['Nelson', 'Melisa Condori', 'Equipo'];
  defaults.forEach((name, i) => {
    sh.appendRow([Utilities.getUuid(), name, true, i, now, now]);
  });
}

// ---- Sheet utils ----

function getSheet_(name) {
  let sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh && HEADERS[name]) {
    sh = SpreadsheetApp.getActive().insertSheet(name);
    sh.appendRow(HEADERS[name]);
  }
  if (!sh) throw new Error('Hoja no encontrada: ' + name + '. Ejecutá setupSpreadsheet primero.');
  return sh;
}

function readAll_(name) {
  const sh = getSheet_(name);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Argentina/Jujuy';
  return rows.slice(1).map(row =>
    headers.reduce((obj, key, i) => {
      const val = row[i];
      if (val instanceof Date) {
        obj[key] = key.indexOf('FECHA') === 0
          ? Utilities.formatDate(val, tz, 'yyyy-MM-dd')
          : val.toISOString();
      } else {
        obj[key] = val;
      }
      return obj;
    }, {})
  );
}

function appendRow_(name, obj) {
  const sh = getSheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(k => {
    const v = obj[k];
    if (v === undefined || v === null) return '';
    // Prefijar fechas YYYY-MM-DD como texto plano para evitar desfasaje de zona horaria
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return "'" + v;
    return v;
  }));
}

// ---- CRUD genérico e idempotente ----

function upsert_(name, id, data) {
  const sh = getSheet_(name);
  ensureSheetHeaders_(sh, HEADERS[name] || []);
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(String);
  const targetId = String(id || data.ID || Utilities.getUuid());
  const now = new Date().toISOString();
  const rowIdx = all.findIndex((row, i) => i > 0 && String(row[0]) === targetId);

  if (rowIdx < 1) {
    const obj = Object.assign({ ID: targetId, CREADO_EN: now, ACTUALIZADO_EN: now }, data, { ID: targetId });
    appendRow_(name, obj);
    return { success: true, data: obj, message: 'Creado' };
  }

  data.ACTUALIZADO_EN = data.ACTUALIZADO_EN || now;
  headers.forEach((key, colIdx) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const v = data[key];
      const cellVal = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? "'" + v : (v === undefined || v === null ? '' : v);
      sh.getRange(rowIdx + 1, colIdx + 1).setValue(cellVal);
    }
  });
  return { success: true, data: Object.assign({ ID: targetId }, data), message: 'Actualizado' };
}

function batchUpsertActivities_(items) {
  if (!Array.isArray(items) || !items.length) return { success: true, data: [] };
  const sh = getSheet_('ACTIVIDADES');
  ensureSheetHeaders_(sh, HEADERS.ACTIVIDADES);
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(String);
  const existingMap = new Map();
  for (let i = 1; i < all.length; i++) {
    existingMap.set(String(all[i][0]), i + 1);
  }
  const now = new Date().toISOString();
  items.forEach(item => {
    if (!item || !item.ID) return;
    const id = String(item.ID);
    const rowNum = existingMap.get(id);
    if (!rowNum) {
      const obj = Object.assign({ ID: id, CREADO_EN: now, ACTUALIZADO_EN: now }, item);
      appendRow_('ACTIVIDADES', obj);
      existingMap.set(id, sh.getLastRow());
    } else {
      item.ACTUALIZADO_EN = item.ACTUALIZADO_EN || now;
      headers.forEach((key, colIdx) => {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const v = item[key];
          const cellVal = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? "'" + v : (v === undefined || v === null ? '' : v);
          sh.getRange(rowNum, colIdx + 1).setValue(cellVal);
        }
      });
    }
  });
  return { success: true, data: { count: items.length } };
}

function batchUpsertExecutions_(items) {
  if (!Array.isArray(items) || !items.length) return { success: true, data: [] };
  const sh = getSheet_('EJECUCIONES');
  ensureSheetHeaders_(sh, HEADERS.EJECUCIONES);
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(String);
  const existingMap = new Map();
  for (let i = 1; i < all.length; i++) {
    existingMap.set(String(all[i][0]), i + 1);
  }
  const now = new Date().toISOString();
  items.forEach(item => {
    if (!item || !item.ID) return;
    const id = String(item.ID);
    const rowNum = existingMap.get(id);
    if (!rowNum) {
      // Solo insertar si no existe (no pisar estados ya completados por otro usuario)
      const obj = Object.assign({ CREADO_EN: now, ACTUALIZADO_EN: now }, item);
      appendRow_('EJECUCIONES', obj);
      existingMap.set(id, sh.getLastRow());
    }
  });
  return { success: true, data: { count: items.length } };
}

function update_(name, id, data, createIfMissing) {
  const sh = getSheet_(name);
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(String);
  const rowIdx = all.findIndex((row, i) => i > 0 && String(row[0]) === String(id));
  if (rowIdx < 1) {
    if (createIfMissing && id) return upsert_(name, id, data);
    return { success: false, error: 'Registro no encontrado: ' + id };
  }
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
  if (rowIdx < 1) return { success: true, data: { id }, message: 'Ya eliminado' };
  sh.deleteRow(rowIdx + 1);
  return { success: true, data: { id }, message: 'Eliminado' };
}

// ---- Creadores específicos (idempotentes por ID) ----

function createNote_(data) {
  const now = new Date().toISOString();
  const id = data.ID || Utilities.getUuid();
  const sh = getSheet_('NOTAS');
  const all = sh.getDataRange().getValues();
  if (all.some((r, i) => i > 0 && String(r[0]) === String(id))) {
    return update_('NOTAS', id, data, true);
  }
  const obj = Object.assign({
    ID: id,
    TEXTO: '', DESCRIPCION: '', ESTADO: 'PENDIENTE',
    FECHA: '', HORA: '', CATEGORIA: 'General', PRIORIDAD: 'NORMAL',
    RESPONSABLE: '', COLOR: 'yellow', FIJADA: false,
    X: 120, Y: 120, ANCHO: 264, ALTO: 155,
    CREADO_EN: now, ACTUALIZADO_EN: now,
    COMPLETADO_EN: '', ARCHIVADO: false, RECORDATORIO: false,
    REPETICION: '', ORDEN: 0, TIPO: 'NOTA'
  }, data, { ID: id });
  appendRow_('NOTAS', obj);
  return { success: true, data: obj, message: 'Nota creada' };
}

function createPerson_(data) {
  const now = new Date().toISOString();
  const existing = readAll_('PERSONAS');
  const name = String(data.NOMBRE || '').trim().toLowerCase();
  const found = existing.find(p => String(p.NOMBRE).trim().toLowerCase() === name);
  if (found) return { success: true, data: found, message: 'Persona ya existente' };
  const obj = Object.assign({
    ID: data.ID || Utilities.getUuid(),
    NOMBRE: '', ACTIVO: true, ORDEN: existing.length,
    CREADO_EN: now, ACTUALIZADO_EN: now
  }, data);
  appendRow_('PERSONAS', obj);
  return { success: true, data: obj, message: 'Persona creada' };
}

function createActivity_(data) {
  const obj = Object.assign({
    ID: data.ID || Utilities.getUuid(),
    NOTA_ID: '', ACCION: '', DETALLE: '',
    ANTES: '', DESPUES: '', ACTOR: '',
    CREADO_EN: new Date().toISOString()
  }, data);
  appendRow_('ACTIVIDAD', obj);
  return { success: true, data: obj };
}

function createChecklistItem_(data) {
  const id = data.ID || Utilities.getUuid();
  const sh = getSheet_('CHECKLIST');
  const all = sh.getDataRange().getValues();
  if (all.some((r, i) => i > 0 && String(r[0]) === String(id))) {
    return update_('CHECKLIST', id, data, true);
  }
  const obj = Object.assign({
    ID: id,
    NOTA_ID: '', TEXTO: '', COMPLETADO: false, ORDEN: 0
  }, data, { ID: id });
  appendRow_('CHECKLIST', obj);
  return { success: true, data: obj };
}
