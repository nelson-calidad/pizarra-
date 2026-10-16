# Google Apps Script — Configuración y Migración Segura

## 1. Actualizar el script existente (sin perder notas ni datos)

1. Abrí tu hoja de Google Sheets actual y hacé clic en **Archivo → Hacer una copia** (respaldo preventivo).
2. En la hoja principal, entrá a **Extensiones → Apps Script**.
3. Reemplazá el contenido de `Code.gs` por el nuevo archivo [`google-apps-script/Code.gs`](./Code.gs) y guardá (`Ctrl + S`).
4. En el selector de funciones superior, seleccioná **`setupSpreadsheet`** y presioná **Ejecutar**.
   - Creará automáticamente las nuevas pestañas **`ACTIVIDADES`**, **`EJECUCIONES`** y **`EVENTOS`** sin tocar ni borrar **`NOTAS`**, **`CHECKLIST`**, **`PERSONAS`**, **`ACTIVIDAD`**, **`ETIQUETAS`** ni **`CONFIG`**.
5. Hacé clic en **Implementar → Administrar implementaciones → Editar (ícono lápiz) → Versión: Nueva versión → Implementar**.
   - Así se mantiene la misma URL de Web App o, si preferís rotar la URL anterior que estuvo en el repositorio público, creá una **Nueva implementación** y archivá la anterior.

## 2. Clave de acceso compartida opcional (RAC y Analista)

Para proteger los datos operativos sin poner credenciales en el código fuente:
1. En la pestaña **`CONFIG`** de tu Google Sheet, agregá una fila con:
   - Columna `CLAVE`: `ACCESS_KEY`
   - Columna `VALOR`: una clave elegida por ustedes (por ejemplo, una frase o código interno).
2. En la aplicación web, abrí **Configuración** (abajo a la izquierda) e ingresá esa misma clave en los navegadores del RAC y del Analista.
