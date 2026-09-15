// cal-webhook.js — recibe el webhook "Booking created" de Cal.com
// Flujo: Cal.com -> esta función -> Meta (evento CAPI + audiencia personalizada)
//
// Estos son eventos VERIFICADOS: solo se disparan cuando Cal.com confirma que la
// cita quedó agendada de verdad, no cuando alguien nada más abre el calendario.
// Por eso viven aquí y no en tracking.js (que solo ve clics del navegador).
//
// Mapeo de slugs -> evento de Meta:
//   admi / cita-para-boda      -> "Schedule" (estándar)   = "Cliente potencial": agendó la LLAMADA/reunión
//   minis-sesiones-oct / dic   -> "Programar" (personalizado) = agendó una SESIÓN de fotos
// Se separan a propósito: una llamada es un lead calificado, una sesión ya es
// un compromiso mucho más cercano a la venta, y conviene poder optimizar campañas
// hacia cada una por separado en el Administrador de Eventos.

const crypto = require('crypto');
const { sendCapiEvent, findOrCreateAudience, addUsersToAudience } = require('./capi');

const TRACKED_SLUGS = {
  'admi': { metaEvent: 'Schedule', audience: true },
  'cita-para-boda': { metaEvent: 'Schedule', audience: true },
  'minis-sesiones-oct': { metaEvent: 'Programar', audience: true },
  'mini-sesiones-dic': { metaEvent: 'Programar', audience: true },
};

const AUDIENCE_NAME = 'Agendaron llamada - Finite Estudio';

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHeader, 'hex'));
  } catch {
    return false; // longitudes distintas u otro error de formato -> firma inválida
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[^\d]/g, '');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signatureHeader =
    event.headers['x-cal-signature-256'] || event.headers['X-Cal-Signature-256'];

  if (!verifySignature(event.body, signatureHeader, process.env.CALCOM_WEBHOOK_SECRET)) {
    return { statusCode: 401, body: 'Firma inválida' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  if (payload.triggerEvent !== 'BOOKING_CREATED') {
    return { statusCode: 200, body: 'Ignorado: no es booking created' };
  }

  const booking = payload.payload || {};
  const slug = booking?.eventType?.slug || booking?.type;
  const config = TRACKED_SLUGS[slug];

  if (!config) {
    // Filtro de slug obligatorio: sin esto, cualquier tipo de evento de Cal.com contamina la audiencia.
    return { statusCode: 200, body: `Ignorado: slug "${slug}" no está en la lista de rastreo` };
  }

  const attendee = (booking.attendees && booking.attendees[0]) || {};
  const email = attendee.email ? attendee.email.trim().toLowerCase() : null;
  const phone = normalizePhone(attendee.phoneNumber || attendee.smsReminderNumber);

  if (!email && !phone) {
    return { statusCode: 200, body: 'Ignorado: sin email ni teléfono' };
  }

  const hashedEmail = email ? sha256(email) : undefined;
  const hashedPhone = phone ? sha256(phone) : undefined;
  const eventId = booking.uid; // clave para deduplicar contra el Pixel del navegador

  try {
    await sendCapiEvent({
      eventName: config.metaEvent,
      eventId,
      hashedEmail,
      hashedPhone,
      actionSource: 'system_generated',
      eventSourceUrl: `https://cal.com/sauldiazph/${slug}`,
    });

    if (config.audience) {
      const audienceId = await findOrCreateAudience(AUDIENCE_NAME);
      await addUsersToAudience(audienceId, { hashedEmail, hashedPhone });
    }
  } catch (err) {
    console.error('Error enviando a Meta:', err);
    // Respondemos 200 igual para que Cal.com no reintente en bucle por un problema del lado de Meta.
    // Revisa los logs de la función en Netlify si esto aparece seguido.
    return { statusCode: 200, body: 'Recibido, pero falló el envío a Meta (ver logs)' };
  }

  return { statusCode: 200, body: 'OK' };
};
