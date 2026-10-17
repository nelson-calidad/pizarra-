const API_URL = 'https://script.google.com/macros/s/AKfycbwP0uhG6nsbdIKbx-M6kQjQAV5tIyJcxR0tcgpiZqu4QFDtMOALfN3gMFW8PiXt2Tr6/exec';
const ACCESS_KEY = '1234';

async function main() {
  const res = await fetch(`${API_URL}?action=getPlanner&key=${ACCESS_KEY}`).then(r => r.json());
  if (!res.success) {
    console.error('Error fetching planner:', res);
    return;
  }
  const execs = res.data.executions || [];
  console.log(`Total executions in Sheet: ${execs.length}`);
  execs.forEach((e, i) => {
    console.log(`[${i+1}] ID: ${e.ID} | ActId: ${e.ACTIVIDAD_ID} | Sucursal: ${e.SUCURSAL} | Fecha: ${e.FECHA} | Estado: ${e.ESTADO} | Nombre: ${e.NOMBRE_ACTIVIDAD}`);
  });
}

main().catch(console.error);

