# sistema de gestion biometrica

Sistema de visualización, control y sincronización de ponches.

## Estabilización (septiembre 2026)

Se aplicó el plan de la auditoría técnica: hardening de secretos, hashing obligatorio, autorización de endpoints, unificación de usuarios, CORS/docs por ambiente, filtro de exportación, PWA y lanzador de escritorio.

Lea en este orden:

1. [docs/ESTABILIZACION.md](docs/ESTABILIZACION.md)
2. [docs/PWA_CERTIFICADO.md](docs/PWA_CERTIFICADO.md)
3. [docs/APP_ESCRITORIO.md](docs/APP_ESCRITORIO.md)
4. [.env.example](.env.example)

## Arranque rápido (desarrollo)

```bat
copy .env.example backend\.env
:: edite SECRET_KEY y BOOTSTRAP_ADMIN_PASSWORD

cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8015 --reload

cd ..\frontend
npm install
npm run dev
```

Frontend: http://localhost:3015 
API: http://127.0.0.1:8015/api/health  
Docs (solo no-producción): http://127.0.0.1:8015/docs

```bat
cd backend
pytest -q
```
