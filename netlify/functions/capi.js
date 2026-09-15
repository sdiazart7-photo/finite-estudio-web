// capi.js — helper que habla con Meta (Graph API) desde cualquier función de Netlify.
// No contiene secretos: todos los valores sensibles vienen de variables de entorno de Netlify.
// Lo usan tanto cal-webhook.js (eventos de agenda, verificados por Cal.com) como
// capi-relay.js (eventos de clic que llegan desde tracking.js en el navegador).

const PIXEL_ID = process.env.META_PIXEL_ID;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_VERSION = 'v21.0';

/**
 * Envía un evento server-side a Meta Conversions API.
 * event_id se usa para deduplicar contra el mismo evento si también llega por Pixel de navegador.
 *
 * actionSource: 'website' para eventos que ocurrieron en el sitio (clics, PageView),
 *               'system_generated' para eventos que confirma un sistema externo (Cal.com).
 */
async function sendCapiEvent({
  eventName,
  eventId,
  eventSourceUrl,
  actionSource,
  hashedEmail,
  hashedPhone,
  fbp,
  fbc,
  clientIpAddress,
  clientUserAgent,
  customData,
}) {
  const userData = {};
  if (hashedEmail) userData.em = [hashedEmail];
  if (hashedPhone) userData.ph = [hashedPhone];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (clientIpAddress) userData.client_ip_address = clientIpAddress;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: actionSource || 'website',
    event_source_url: eventSourceUrl,
    user_data: userData,
  };
  if (customData && Object.keys(customData).length) {
    event.custom_data = customData;
  }

  const body = {
    data: [event],
    access_token: ACCESS_TOKEN,
  };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`CAPI error: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Busca la audiencia por nombre exacto en la cuenta publicitaria; si no existe, la crea.
 * Devuelve el ID de la audiencia.
 */
async function findOrCreateAudience(name) {
  const searchRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/customaudiences?fields=id,name&access_token=${ACCESS_TOKEN}`
  );
  const searchData = await searchRes.json();
  if (!searchRes.ok) throw new Error(`Error buscando audiencias: ${JSON.stringify(searchData)}`);

  const existing = (searchData.data || []).find((a) => a.name === name);
  if (existing) return existing.id;

  const createRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/customaudiences`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        subtype: 'CUSTOM',
        description: 'Personas que agendaron una llamada vía Cal.com',
        customer_file_source: 'USER_PROVIDED_ONLY',
        access_token: ACCESS_TOKEN,
      }),
    }
  );
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(`Error creando audiencia: ${JSON.stringify(createData)}`);
  return createData.id;
}

/**
 * Agrega un usuario (ya hasheado) a la audiencia personalizada indicada.
 */
async function addUsersToAudience(audienceId, { hashedEmail, hashedPhone }) {
  const schema = [];
  const row = [];

  if (hashedEmail) {
    schema.push('EMAIL');
    row.push(hashedEmail);
  }
  if (hashedPhone) {
    schema.push('PHONE');
    row.push(hashedPhone);
  }
  if (schema.length === 0) return null;

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${audienceId}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: { schema, data: [row] },
      access_token: ACCESS_TOKEN,
    }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`Error agregando a audiencia: ${JSON.stringify(result)}`);
  return result;
}

module.exports = { sendCapiEvent, findOrCreateAudience, addUsersToAudience };
