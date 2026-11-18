# Sistema de ventas (app)

Electron + React + TypeScript + SQLite (`node:sqlite`). Contexto del proyecto en `../CLAUDE.md`.

```bash
npm install
npm run dev        # abre la app con recarga en caliente
npm run typecheck
npm run build:win  # instalador para Windows
```

- `src/main/`: proceso principal (base de datos, usuarios, productos, IPC).
- `src/preload/`: puente mínimo `window.ipc.invoke`.
- `src/renderer/`: interfaz React; `api.ts` da la API tipada.
- `src/shared/tipos.ts`: tipos comunes.

La base queda en la carpeta de datos del usuario (`%APPDATA%/sistema-ventas/ventas.db` en Windows).
