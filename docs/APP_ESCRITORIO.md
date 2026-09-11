# Convertir PocheNuevaVersion en aplicación de escritorio

`backend/desktop.py` original fallaba por varias causas habituales:

1. No resolvía rutas cuando PyInstaller empaqueta (`sys.frozen` / `_MEIPASS`).
2. Montaba `frontend/dist` sin comprobar que el build existiera.
3. Abría la ventana a 1 segundo sin esperar a que uvicorn escuchara.
4. No incluía `pywebview` ni `pyinstaller` en `requirements.txt`.
5. El spec copiaba mal el paquete `app`.

El lanzador se reescribió para:

- Detectar modo congelado vs. desarrollo
- Montar el frontend solo si `index.html` existe
- Esperar a que el puerto 8090 responda
- Reutilizar un backend ya levantado

## Requisitos

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

En Windows, pywebview usa Edge WebView2. Instale el runtime si no está:
https://developer.microsoft.com/microsoft-edge/webview2/

## 1. Compilar el frontend

```bat
cd frontend
npm install
npm run build
```

Debe existir `frontend/dist/index.html`.

## 2. Probar en modo desarrollo

```bat
cd backend
python desktop.py
```

Se abre una ventana nativa contra `http://127.0.0.1:8090`.

Variables opcionales:

- `PONCHES_DESKTOP_HOST` (default `127.0.0.1`)
- `PONCHES_DESKTOP_PORT` (default `8090`)

## 3. Generar el ejecutable

Desde la raíz del repo:

```bat
cd backend
pip install pyinstaller pywebview
cd ..
pyinstaller PonchesApp.spec
```

Salida: `dist/PonchesApp/PonchesApp.exe`.

Copie junto al exe (o deje que el spec los incluya):

- `frontend/dist`
- `backend/data`
- `backend/.env`  (no lo empaquete con secretos de producción en el repo)

## 4. Checklist si la ventana sale en blanco

1. ¿Existe `frontend/dist/index.html` dentro del bundle?
2. ¿WebView2 Runtime instalado?
3. ¿El puerto 8090 está libre? Cambie `PONCHES_DESKTOP_PORT`.
4. Ejecute una vez con consola: en `PonchesApp.spec` ponga `console=True` para ver el traceback.
5. El API interno sigue siendo FastAPI; la app de escritorio **no sustituye** SQL Server ni los relojes ZKTeco.

## 5. Alternativa

Si pywebview sigue dando guerra en un equipo concreto, la vía más estable en Windows es:

1. Publicar frontend+API en IIS local (`https://127.0.0.1`)
2. Crear un acceso directo de Edge/Chrome en modo app:

```bat
msedge --app=https://127.0.0.1
```
