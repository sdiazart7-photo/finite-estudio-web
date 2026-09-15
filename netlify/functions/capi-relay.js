// capi-relay.js — recibe los eventos que tracking.js manda desde el navegador
// (PageView, Lead, Contact, VerPortafolio, VerBlog, InicioBlog, InitiateCheckout, Purchase)
// y los reenvía a Meta Conversions API con el MISMO event_id que ya se mandó por Pixel,
// para que Meta deduplique y se quede con los datos de mejor calidad disponibles.
//
// No requiere secretos del lado del navegador: la IP y el user-agent los toma
// directamente de la petición, y fbp/fbc llegan como los mandó tracking.js.

const { sendCapiEvent } = require('./capi');

// Nombres de evento que este endpoint acepta. Cualquier otro valor se ignora
// silenciosamente — así una llamada mal formada o maliciosa no le mete
// eventos falsos al Administrador de Eventos.
const EVENTOS_PERMITIDOS = new Set([
  'PageView',
  'Lead',
  'Contact',
  'VerPortafolio',
  'VerBlog',
  'InicioBlog',
  'InitiateCheckout',
  'Purchase',
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
