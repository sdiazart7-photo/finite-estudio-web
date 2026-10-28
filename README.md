# Finite Estudio

Sitio de [finiteestudio.com](https://finiteestudio.com): HTML, CSS y JavaScript sin paso de compilación, publicado en Netlify desde este repositorio.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | Inicio (una sola página). Portafolio y preguntas frecuentes viven como HTML estático |
| `blog/` | Índice del blog y un artículo por carpeta (`blog/<slug>/index.html`) |
| `propuesta/`, `love-season/`, `infoprecios/` | Páginas de embudo (cotización, sesiones de pareja, precios). Las tres llevan `noindex` |
| `herramientas/` | Contrato, pago y recibos (uso interno y con clientes). Llevan `noindex` |
| `gracias.html`, `gracias-cita.html`, `gracias-anticipo.html` | Una página de gracias por tipo de conversión (ver más abajo) |
| `privacidad.html`, `404.html`, `recursos/` | Páginas de servicio |
| `netlify/functions/` | Funciones: relay de Meta CAPI, webhook de Cal.com, envío del contrato |
| `scripts/sync-home.js` | Escribe el portafolio y las FAQ del inicio como HTML estático |
| `.github/workflows/uptime.yml` | Vigilante: avisa por correo si el sitio se cae |

## CSS: un archivo global y uno por página

Ningún HTML lleva estilos incrustados. Todas las páginas cargan primero `assets/global.css` (colores, tipografías, nav de cápsula, botones, formularios, pie de página) y después su propio archivo:

| Página | CSS propio |
|---|---|
| Inicio | `assets/home.css` |
| Blog (índice y artículos) | `assets/blog.css` |
| `infoprecios/`, `love-season/`, `propuesta/` | `assets/<nombre>.css` |
| `herramientas/*` | `assets/contrato.css`, `assets/pago.css`, `assets/recibos.css` |
| 404, gracias, privacidad, recursos | solo `global.css` |

Las tipografías Glacial Indifference viven en `assets/fonts/` y Cormorant Garamond viene de Google Fonts.

**Importante sobre el caché:** `netlify.toml` cachea `/assets/*` durante un año. Cada vez que cambies un `.css` o `.js`, sube el número de versión en los `<link>`/`<script>` que lo cargan (por ejemplo `global.css?v=4` pasa a `?v=5`). Sin eso, los visitantes verán la versión vieja.

## Inicio: sincronizar portafolio y FAQ

El portafolio y las preguntas frecuentes se editan en los arreglos `portfolioImages`, `portfolioAlts` y `faqs` dentro de `index.html`. Después de editarlos, corre:

```
node scripts/sync-home.js          # reescribe index.html con el HTML estático
node scripts/sync-home.js --check  # solo avisa si está desactualizado
```

Si olvidas correrlo, el navegador repinta esos bloques desde los arreglos y nada se rompe. Los buscadores verían la versión anterior hasta la siguiente sincronización.

## Medición

- `assets/tracking.js` carga el Pixel de Meta y GA4 en todas las páginas. Los eventos salen por clic con `data-track="..."` o por tipo de página con `<body data-page-type="...">`.
- Cada evento viaja también por servidor a `netlify/functions/capi-relay.js` con el mismo `event_id`, para que Meta lo deduplique.
- Si agregas un evento nuevo en `tracking.js`, agrégalo también a `EVENTOS_PERMITIDOS` en `capi-relay.js`.
- `Schedule` y `Programar` se confirman desde `cal-webhook.js` cuando Cal.com avisa que la cita quedó agendada.

### Páginas de gracias por conversión

| Conversión | Página | Cómo llega la persona |
|---|---|---|
| Formulario de contacto | `/gracias.html` | El formulario del inicio la usa como `action` |
| Cita agendada en Cal.com | `/gracias-cita.html` | Hay que configurarla en Cal.com (abajo) |
| Comprobante de anticipo | `/gracias-anticipo.html` | `herramientas/pago.html` redirige 1.5 s después del clic en "Enviar comprobante" |

Para la de la cita, en Cal.com abre cada tipo de evento (cita-para-boda y los demás que quieras medir) > Advanced > **Redirect on booking** y escribe `https://finiteestudio.com/gracias-cita.html`. Con una URL distinta por conversión puedes crear conversiones personalizadas por URL en Meta y metas en Google.

## Variables de entorno (Netlify > Site configuration > Environment variables)

`META_ACCESS_TOKEN`, `META_PIXEL_ID`, `META_AD_ACCOUNT_ID`, `CALCOM_WEBHOOK_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CONTRATO_NOTIFY_EMAIL`.

## Vigilante del sitio

`.github/workflows/uptime.yml` corre cada 30 minutos y revisa el inicio, las hojas de estilo, la fuente, el blog y el relay de Meta. Si algo falla, GitHub envía un correo con el aviso de ejecución fallida. Se puede lanzar a mano desde la pestaña Actions. GitHub pausa los workflows programados tras 60 días sin actividad en el repo.

## Redirecciones antiguas

`_redirects` conserva las URLs de Pixieset que Google todavía tiene indexadas. No las borres.
