# Integración SIGO Front

## Base
- Asistencia: estructura funcional unificada a partir de SIGO-FRONT.
- Relevos: endpoints y organización alineados con SIGO-RELEVOS.
- Inventario: pantallas recuperadas del ZIP proporcionado y adaptadas al JWT global.

## Cambios principales
1. Un solo login global.
2. JWT mediante `Authorization: Bearer`.
3. Interceptor HTTP global.
4. Guards por módulo y rol.
5. Cambio obligatorio de contraseña preparado.
6. Un solo layout responsivo.
7. Inventario ya no utiliza `X-Usuario-Codigo`.
8. Módulos separados:
   - `features/asistencia`
   - `features/relevos`
   - `features/inventario`
9. Angular unificado en versión 22.

## Rutas principales
- `/login`
- `/cambiar-password`
- `/relevos/nuevo`
- `/relevos/historial`
- `/relevos/:id`
- `/asistencia/registrar`
- `/asistencia/historial`
- `/inventario/nuevo`
- `/inventario/historial`
- `/inventario/stock`
- `/inventario/productos`

## Permisos
OPERADOR:
- Relevos
- Inventario

CONTROLADOR:
- Dashboard
- Relevos
- Asistencia
- Inventario
- Administrar productos
- Chat (backend preparado; pantalla no incluida en esta integración)

SUPERVISOR:
- Dashboard
- Relevos
- Asistencia
- Inventario
- Administrar productos
- Trabajadores y Chat (backend preparado; pantallas no incluidas en esta integración)

## Ejecución
```bash
npm install
npm start
```

Backend local esperado:
`http://localhost:8080`

El proxy incluido envía `/api` al backend.

## Nota del cambio de contraseña
El frontend ya invoca:
`PUT /api/auth/change-password`

El backend debe exponer ese endpoint y devolver `requiereCambioPassword` en login/me para activar todo el flujo.
