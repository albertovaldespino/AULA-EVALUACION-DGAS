# AulaPulso Evalua fuera de la red local

Para que los estudiantes respondan desde sus casas, la app debe estar disponible en internet mediante una URL publica.

## Opcion rapida: tunel temporal

1. Inicia la app:

```bash
cd /Users/albertovaldespinoparedes/Documents/Codex/2026-06-10/files-mentioned-by-the-user-examen/outputs/ultrasonido-examen-app
ADMIN_PASSWORD="cambia-esta-clave" node server.js
```

2. Publica el puerto `8765` con una herramienta de tunel como Cloudflare Tunnel, ngrok o Tailscale Funnel.

Ejemplo con ngrok:

```bash
ngrok http 8765
```

Comparte con alumnos la URL publica que termine en `/`.

El panel administrador estara en:

```text
https://TU-URL-PUBLICA/admin.html
```

## Opcion estable: servidor en la nube

Sube esta carpeta completa a un servidor Node.js que permita escritura en disco, por ejemplo un VPS, Render con disco persistente, Railway con volumen, Fly.io con volumen o una maquina institucional.

Comando de arranque:

```bash
ADMIN_PASSWORD="cambia-esta-clave" PORT=8765 node server.js
```

## Envio real de resultados por correo

El participante captura su correo antes de iniciar. Al terminar el examen, la app genera un correo HTML con escudos, calificacion, reactivos correctos e incorrectos y retroalimentacion.

Para que el correo salga realmente al destinatario, Render debe tener esta variable de entorno:

```text
BREVO_API_KEY
```

La app envia por HTTPS a la API de Brevo:

```text
https://api.brevo.com/v3/smtp/email
```

El remitente se toma de la variable de entorno `EMAIL_FROM`. Ese correo debe estar validado/autorizado como sender en Brevo. Si el envio falla, revisa Render Logs; los errores aparecen con el prefijo `[EMAIL]`.

## Seguridad minima

- Cambia siempre `ADMIN_PASSWORD`.
- Comparte el enlace de administrador solo con el responsable del curso.
- Exporta CSV al finalizar.
- Conserva `content.json` y `server-state.json`; ahi se guardan curso, participantes, reactivos y respuestas.

## Credenciales

Los participantes entran con su numero de usuario `U001`, `U002`, etc. y la contraseña asignada.
El administrador puede exportar las credenciales desde el panel.
