# Google Apps Script

1. Cree un Google Sheet y abra **Extensiones → Apps Script**.
2. Pegue `Code.gs`, guarde y ejecute `setupSpreadsheet` una vez para crear las hojas.
3. En **Implementar → Nueva implementación**, seleccione Aplicación web y copie la URL.
4. Cree `.env` desde `.env.example` y pegue la URL en `VITE_GOOGLE_SCRIPT_URL`.

Use `GET ?action=getNotes` o `POST` JSON con `{ action, id, data }`. Apps Script devuelve JSON con `success`, `data`, `message` y `error`. `ContentService` es el patrón compatible para Web Apps; no agregue cabeceras CORS manuales.
