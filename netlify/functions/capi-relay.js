// capi-relay.js — recibe los eventos que tracking.js manda desde el navegador
// (todos los de EVENTOS_PERMITIDOS de abajo)
// y los reenvía a Meta Conversions API con el MISMO event_id que ya se mandó por Pixel,
// para que Meta deduplique y se quede con los datos de mejor calidad disponibles.
//
// No requiere secretos del lado del navegador: la IP y el user-agent los toma
// directamente de la petición, y fbp/fbc llegan como los mandó tracking.js.

const { sendCapiEvent } = require('./capi');

// Nombres de evento que este endpoint acepta. Cualquier otro valor se ignora
// silenciosamente — así una llamada mal formada o maliciosa no le mete
// eventos falsos al Administrador de Eventos.
// Tiene que coincidir 1 a 1 con lo que manda assets/tracking.js
// (mapa EVENTOS + eventos automáticos + window.FiniteTrack). Si un nombre
// falta aquí, ese evento llega a Meta solo por Pixel, sin respaldo de CAPI.
const EVENTOS_PERMITIDOS = new Set([
  // Automáticos (tracking.js, secciones 4 y 6)
  'PageView',
  'VerBlog',
  'InicioBlog',
  'InitiateCheckout',   // también por clic en contrato.html
  // Por clic (data-track)
  'InteresadoEnCita',   // también al enviar el formulario del home
  'Contact',
  'ClicCTABlog',
  'VerPortafolio',
  'SolicitudTarjeta',
  'Purchase',
  // Por window.FiniteTrack desde el quiz de /propuesta/
  'VerPaquetes',
]);

// Dominios desde los que tracking.js puede mandar eventos.
const HOSTS_PERMITIDOS = ['finiteestudio.com', 'www.finiteestudio.com'];

function hostDe(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

// Tope de monto por evento (MXN). Un anticipo real queda muy por debajo;
// un valor absurdo viene casi seguro de una llamada falsa.
const VALOR_MAXIMO = 200000;

function limpiarCustomData(cd) {
  if (!cd || typeof cd !== 'object') return undefined;
  const out = {};
  if (cd.value !== undefined) {
    const v = Number(cd.value);
    if (Number.isFinite(v) && v >= 0 && v <= VALOR_MAXIMO) out.value = v;
  }
  if (typeof cd.currency === 'string' && /^[A-Za-z]{3}$/.test(cd.currency)) {
    out.currency = cd.currency.toUpperCase();
  }
  return Object.keys(out).length ? out : undefined;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  const { eventName, eventId, eventSourceUrl, customData, fbp, fbc, em, ph } = payload;

  // em/ph llegan ya hasheados (SHA-256) desde tracking.js. Si no tienen forma
  // de hash, se descartan: así nunca se reenvía a Meta un dato en claro.
  const pareceHash = (v) => typeof v === 'string' && /^[a-f0-9]{64}(\.[A-Za-z0-9_-]+)?$/.test(v);

  if (!EVENTOS_PERMITIDOS.has(eventName) || !eventId) {
    // Respondemos 200 para no generar reintentos ni errores visibles en el navegador
    // del visitante; simplemente no reenviamos nada a Meta.
    return { statusCode: 200, body: 'Ignorado' };
  }

  // Seguro de origen: solo se aceptan eventos que declaran venir de este sitio.
  // Sin esto, cualquiera podía mandar a mano un "Purchase" o "InitiateCheckout"
  // con un valor inventado y ensuciar lo que Meta aprende para optimizar anuncios.
  // (No es una barrera infalible, porque un script puede mentir sobre la URL,
  // pero corta el ruido casual y obliga a hacerlo a propósito.)
  if (!HOSTS_PERMITIDOS.includes(hostDe(eventSourceUrl))) {
    return { statusCode: 403, body: 'Origen no permitido' };
  }
  const origenHeader = event.headers['origin'] || event.headers['Origin'];
  if (origenHeader && !HOSTS_PERMITIDOS.includes(hostDe(origenHeader))) {
    return { statusCode: 403, body: 'Origen no permitido' };
  }
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(eventId)) {
    return { statusCode: 200, body: 'Ignorado' };
  }

  // Solo viajan a Meta los campos que el sitio usa de verdad (value y currency),
  // con valores acotados. Cualquier otra llave se descarta.
  const customDataLimpio = limpiarCustomData(customData);

  const clientIpAddress =
    event.headers['x-nf-client-connection-ip'] ||
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    undefined;
  const clientUserAgent = event.headers['user-agent'];

  try {
    await sendCapiEvent({
      eventName,
      eventId,
      eventSourceUrl,
      actionSource: 'website',
      hashedEmail: pareceHash(em) ? em : undefined,
      hashedPhone: pareceHash(ph) ? ph : undefined,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      clientIpAddress,
      clientUserAgent,
      customData: customDataLimpio,
    });
  } catch (err) {
    console.error('Error enviando a Meta CAPI:', err);
    // 200 igual: es un evento de tracking, no una acción crítica del visitante.
    return { statusCode: 200, body: 'Recibido, pero falló el envío a Meta (ver logs)' };
  }

  return { statusCode: 200, body: 'OK' };
};
