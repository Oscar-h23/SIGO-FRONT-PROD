# Corrección del módulo Asistencia

Esta versión conserva el login/JWT del frontend modular y reemplaza el módulo de Asistencia simplificado por el módulo completo de SIGO-FRONT.

## Incluido
- Registro completo de asistencia.
- Catálogos de plazas, turnos y motivos.
- Agentes y controladores por plaza.
- Ausencias.
- Personal de apoyo.
- Evidencias.
- Historial completo.
- Filtros y paginación.
- Detalle.
- Edición de asistencia.
- Generación PDF (requiere `jspdf`).

## API en desarrollo
`src/environments/environment.ts` usa:

```ts
apiUrl: '/api'
```

`proxy.conf.json` reenvía `/api` a `http://localhost:8080`.

Ejemplos:
- `/api/auth/login`
- `/api/asistencias`
- `/api/plazas`
- `/api/turnos`
- `/api/motivos-ausencia`
- `/api/trabajadores/agentes?plazaId=...`
- `/api/trabajadores/controladores?plazaId=...`

## Ejecutar
```bash
npm install
npm start
```
