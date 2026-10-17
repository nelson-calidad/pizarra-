const API_URL = 'https://script.google.com/macros/s/AKfycbwP0uhG6nsbdIKbx-M6kQjQAV5tIyJcxR0tcgpiZqu4QFDtMOALfN3gMFW8PiXt2Tr6/exec';
const ACCESS_KEY = '1234';

async function testSaltaPersistence() {
  const post = async (body) => {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: ACCESS_KEY, ...body })
    });
    return await res.json();
  };

  const getPlanner = async () => {
    const res = await fetch(`${API_URL}?action=getPlanner&key=${ACCESS_KEY}`).then(r => r.json());
    return res.data;
  };

  const actId = 'bcddc67a-3f3c-4575-b9a2-34920c364391';
  const saltaExecId = `${actId}__2026-10-16__SALTA`;
  const jujuyExecId = `${actId}__2026-10-16__JUJUY`;

  console.log('--- PASO 1: Marcar únicamente SALTA como REALIZADA en Google Sheets ---');
  const updateRes = await post({
    action: 'upsertExecution',
    id: saltaExecId,
    data: {
      ID: saltaExecId,
      ACTIVIDAD_ID: actId,
      PERIODO: '2026-10-16',
      SUCURSAL: 'SALTA',
      FECHA: '2026-10-16',
      ESTADO: 'REALIZADA',
      EJECUTOR: 'Analista de Calidad',
      COMPLETADO_POR: 'ANALISTA',
      COMPLETADO_EN: new Date().toISOString(),
      NOMBRE_ACTIVIDAD: 'Comunicar resumen de indicadores a cuatro grupos de WhatsApp',
      MODO_CUMPLIMIENTO: 'POR_SUCURSAL',
      ACCION_CUMPLIMIENTO: 'ENVIADO'
    }
  });
  console.log('Resultado de marcar Salta:', updateRes);

  console.log('\n--- PASO 2: Simular recarga consultando getPlanner desde Sheets ---');
  const plannerData = await getPlanner();
  const saltaExec = plannerData.executions.find(e => e.ID === saltaExecId);
  const jujuyExec = plannerData.executions.find(e => e.ID === jujuyExecId);

  console.log('Estado de Salta recuperado de Sheets:', saltaExec ? saltaExec.ESTADO : 'NO ENCONTRADO');
  console.log('Ejecutor de Salta recuperado de Sheets:', saltaExec ? saltaExec.EJECUTOR : 'NO ENCONTRADO');
  console.log('Estado de Jujuy recuperado de Sheets:', jujuyExec ? jujuyExec.ESTADO : 'NO ENCONTRADO');

  if (saltaExec && saltaExec.ESTADO === 'REALIZADA' && jujuyExec && jujuyExec.ESTADO === 'PENDIENTE') {
    console.log('\n>>> PRUEBA EXITOSA: Salta quedó guardada como REALIZADA y Jujuy continúa PENDIENTE tras recarga. <<<');
  } else {
    console.error('\n>>> ERROR EN PRUEBA DE PERSISTENCIA <<<');
    process.exit(1);
  }

  // Devolver Salta a PENDIENTE para dejar el tablero listo para el uso operativo diario
  console.log('\n--- PASO 3: Restablecer Salta a PENDIENTE para dejar el tablero limpio ---');
  await post({
    action: 'upsertExecution',
    id: saltaExecId,
    data: {
      ID: saltaExecId,
      ESTADO: 'PENDIENTE',
      EJECUTOR: '',
      COMPLETADO_POR: '',
      COMPLETADO_EN: ''
    }
  });
  console.log('Salta restablecida a PENDIENTE.');
}

testSaltaPersistence().catch(err => {
  console.error(err);
  process.exit(1);
});

