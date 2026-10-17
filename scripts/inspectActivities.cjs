const API_URL = 'https://script.google.com/macros/s/AKfycbwP0uhG6nsbdIKbx-M6kQjQAV5tIyJcxR0tcgpiZqu4QFDtMOALfN3gMFW8PiXt2Tr6/exec';
const ACCESS_KEY = '1234';

async function main() {
  const res = await fetch(`${API_URL}?action=getPlanner&key=${ACCESS_KEY}`).then(r => r.json());
  if (!res.success) {
    console.error('Error fetching planner:', res);
    return;
  }
  const acts = res.data.activities || [];
  console.log(`Total activities in Sheet: ${acts.length}`);
  acts.forEach((a, i) => {
    console.log(`[${i+1}] ID: ${a.ID} | ${a.NOMBRE} | SUCURSAL: ${a.SUCURSAL} | POR_SUCURSAL: ${a.POR_SUCURSAL} | FREQ: ${a.FRECUENCIA}`);
  });
}

main().catch(console.error);

