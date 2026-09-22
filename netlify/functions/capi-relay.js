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

  const { eventName, eventId, eventSourceUrl, customData, fbp, fbc } = payload;

  if (!EVENTOS_PERMITIDOS.has(eventName) || !eventId) {
    // Respondemos 200 para no generar reintentos ni errores visibles en el navegador
    // del visitante; simplemente no reenviamos nada a Meta.
    return { statusCode: 200, body: 'Ignorado' };
  }

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
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      clientIpAddress,
      clientUserAgent,
      customData,
    });
  } catch (err) {
    console.error('Error enviando a Meta CAPI:', err);
    // 200 igual: es un evento de tracking, no una acción crítica del visitante.
    return { statusCode: 200, body: 'Recibido, pero falló el envío a Meta (ver logs)' };
  }

  return { statusCode: 200, body: 'OK' };
};
