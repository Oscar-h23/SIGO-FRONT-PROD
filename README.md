# SIGO Front Modular

Frontend unificado de SIGO, organizado por módulos y alineado con el backend Spring Boot.

## Módulos
- Auth global JWT
- Dashboard
- Asistencia
- Relevos
- Inventario

## Estructura
- `core/auth`: login, JWT, interceptor y guards
- `features/asistencia`
- `features/relevos`
- `features/inventario`
- `layout/main-layout`

## Desarrollo
1. Backend: `http://localhost:8080`
2. `npm install`
3. `npm start`

El proxy envía `/api` al backend local.

## Roles
- SUPERVISOR: Dashboard, Relevos, Asistencia, Inventario, Productos, Trabajadores, Chat
- CONTROLADOR: Dashboard, Relevos, Asistencia, Inventario, Productos, Chat
- OPERADOR: Relevos, Inventario

## Primer ingreso
Si el backend retorna `requiereCambioPassword=true`, la app redirige a `/cambiar-password`.
