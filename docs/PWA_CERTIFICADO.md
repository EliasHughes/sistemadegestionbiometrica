# Certificado HTTPS para que la PWA funcione

Los service workers y la instalación como PWA **requieren un origen seguro**:

- `https://` en la red o en producción
- `http://localhost` / `http://127.0.0.1` solo en la máquina local

Si publica la app en `http://172.21.20.14` u otro IP interno, Chrome/Edge **no** permitirán instalar la PWA ni registrar `sw.js` de forma persistente. Hay que servirla con TLS.

## 1. Certificado de desarrollo de confianza (recomendado)

Use [mkcert](https://github.com/FiloSottile/mkcert). Instala una CA local en el almacén de Windows y emite un certificado que el navegador confía.

```bat
winget install FiloSottile.mkcert
mkcert -install
cd C:\ruta\PocheNuevaVersion\certs
mkcert localhost 127.0.0.1 172.21.20.14 ::1
```

Eso genera:

- `localhost+3.pem`  → certificado
- `localhost+3-key.pem` → clave privada

Arranque FastAPI / IIS / Caddy con esos archivos. Ejemplo uvicorn:

```bat
uvicorn app.main:app --host 0.0.0.0 --port 8012 --ssl-certfile ..\certs\localhost+3.pem --ssl-keyfile ..\certs\localhost+3-key.pem
```

Y Vite (si desarrolla con proxy):

```ts
server: {
  https: {
    cert: fs.readFileSync("../certs/localhost+3.pem"),
    key: fs.readFileSync("../certs/localhost+3-key.pem"),
  }
}
```

## 2. Certificado autofirmado con OpenSSL

Sirve para pruebas, pero cada navegador mostrará advertencia y **algunos no registrarán el service worker** hasta que acepte el riesgo.

```bat
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes ^
  -keyout poche.key -out poche.crt ^
  -subj "/CN=172.21.20.14" ^
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:172.21.20.14"
```

Importe `poche.crt` en:

- *Administrar certificados de equipo* → *Entidades de certificación raíz de confianza*

## 3. Producción / IIS

1. Compre o emita un certificado (AD CS interno, Let’s Encrypt si hay DNS público, o mkcert solo para LAN de prueba).
2. En IIS: *Sitio* → *Bindings* → `https` puerto 443 → seleccione el certificado.
3. Redirija HTTP → HTTPS.
4. No exponga `/docs` ni `/redoc` (`ENABLE_DOCS=false`, `APP_ENV=production`).
5. `CORS_ORIGINS` debe listar exactamente `https://servidor`.

Let’s Encrypt (si el host es público):

```bat
certbot certonly --webroot -w C:\inetpub\wwwroot -d poche.empresa.local
```

## 4. Comprobar que la PWA queda instalable

1. Abra `https://host/` (candado en verde o “seguro”).
2. F12 → Application → Service Workers → debe aparecer registrado.
3. Application → Manifest → iconos 192 y 512.
4. En Chrome: menú → *Instalar Visualizador de Ponches*.
5. En Edge: icono de instalación en la barra.

Los archivos `frontend/public/pwa-192.png.png` y `pwa-512.png.png` tienen extensión duplicada. Renómbralos a `pwa-192.png` y `pwa-512.png` o actualice el manifest para que coincida con los nombres reales.

## 5. Qué no hacer

- No use el certificado de desarrollo en Internet.
- No suba `.pem`, `.key`, `.pfx` al repositorio (ya están en `.gitignore`).
- No sirva la PWA por HTTP en un IP de LAN y espere que se instale.
