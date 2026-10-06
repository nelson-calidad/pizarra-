# Mi Tablero

Un pizarrón personal de notas y recordatorios. Cada nota se refleja en Pizarrón, Mi día, Recordatorios, Calendario y Hechos.

```bash
npm install
npm run dev
npm run build
```

Copie `.env.example` como `.env`; la integración de Google Sheets se documenta en [google-apps-script/README.md](google-apps-script/README.md). Sin URL remota, la versión de desarrollo conserva las notas en `localStorage`.

Atajos: `Ctrl/Cmd + N` crea una nota, `Ctrl/Cmd + K` abre búsqueda y `Escape` cierra paneles. El resultado de `npm run build` (`dist/`) se puede publicar directamente en Render o Vercel.
