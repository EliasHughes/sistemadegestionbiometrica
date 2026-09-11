# Cambios aplicados según la auditoría técnica

Fecha base de la auditoría: 9 de septiembre de 2026.
Repositorio: https://github.com/EliasHughes/PocheNuevaVersion

## Qué se corrigió

### Seguridad crítica
- Eliminadas las dos `SECRET_KEY` hardcodeadas. Solo se lee de entorno. En producción el arranque falla si la clave es débil o ausente. En desarrollo se genera una clave efímera.
- Eliminado el fallback a contraseña en texto plano en `security.py` y en `/auth/login`.
- `verify_password` rechaza cualquier valor que no sea hash bcrypt.
- Ya no se crean usuarios `admin` / `elias` / `supervisor` con `admin123`.
- El primer administrador solo nace con `BOOTSTRAP_ADMIN_PASSWORD` (política: 10+ caracteres, letras y números).
- Endpoints sensibles ahora exigen JWT: records, export, schema, payroll, remote, settings, devices, collaborators.
- `/api/schema` quedó restringido a rol admin y a una allowlist de tablas (`SCHEMA_ALLOWED_TABLES`).
- Se eliminaron las rutas duplicadas de schema.
- `/docs` y `/redoc` se desactivan cuando `APP_ENV=production` (o `ENABLE_DOCS=false`).
- CORS deja de usar `*` en métodos y headers.

### Autenticación
- Login unificado contra `app.services.app_users`.
- `services/users.py` es solo una fachada. Una sola fuente de verdad.
- Nuevo `POST /api/auth/change-password`.
- Los CRUD de `/api/records/app-users` ya no guardan `password: "1234"` en claro; delegan al servicio canónico.

### API / exportación
- El filtro de fechas inclusivo/exclusivo (`fecha >= desde` y `fecha < DATEADD(day,1,hasta)`) se mantiene.
- Export Excel/PDF aceptan GET y POST para no romper el frontend.
- DataExport usa `access_token` (antes buscaba `token` / `auth_token` y el login guardaba `access_token`).
- Contrato preferido del frontend: `fecha_desde`, `fecha_hasta`, `dispositivo`, `limit`.

### Observabilidad
- Middleware `X-Request-ID`.
- Handler global que no filtra stack traces al cliente.

### Escritorio
- `backend/desktop.py` reescrito: rutas PyInstaller, espera de puerto, montaje condicional del frontend.

### Pruebas mínimas
- `backend/tests/test_security.py`
- `backend/tests/test_export_dates.py`
- `backend/tests/test_auth_guards.py`

Ejecutar:

```bat
cd backend
pytest -q
```

## Qué debe hacer el operador al desplegar

1. Copiar `.env.example` → `backend/.env`.
2. Generar `SECRET_KEY` larga.
3. Definir `BOOTSTRAP_ADMIN_PASSWORD` fuerte **solo** si aún no existe `backend/data/app_users.json`.
4. Reiniciar el proceso FastAPI que realmente atiende el puerto (8012 en Vite, 8090 en desktop).
5. Confirmar en el Administrador de tareas / `netstat` qué copia se ejecuta. La auditoría insistió: el síntoma “exporta el mes completo” suele ser runtime viejo, no el archivo de GitHub.
6. Probar un día concreto + un reloj contra `/api/records/export/excel`.
7. Rotar cualquier contraseña que hubiera quedado en texto plano (el servicio las rehashea y marca `must_change_password`).

## SQL recomendado (no se aplicó automático)

```sql
-- Ajustar tipos/nombres reales después de consultar /api/records/columns
CREATE NONCLUSTERED INDEX IX_punches_fecha_dispositivo
  ON dbo.punches (fecha DESC, dispositivo_origen)
  INCLUDE (codigo, nombre, entrada, salida);
```

## Criterio para volver a agregar features

No abrir módulos nuevos hasta cumplir la lista de la sección 15 de la auditoría: secretos fuera del código, hashing obligatorio, endpoints protegidos, export con pruebas de rango, un solo sistema de usuarios, docs/CORS endurecidos.
