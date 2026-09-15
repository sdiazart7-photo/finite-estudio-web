// contrato.js — recibe los datos + PDF del contrato ya firmado (desde
// herramientas/contrato.html) y manda DOS correos con el PDF adjunto,
// vía Resend (https://resend.com):
//   1. Al cliente, al correo que escribió en el formulario.
//   2. A Finite Estudio, como aviso interno de que se firmó un contrato.
//
// Variables de entorno necesarias en Netlify (Site settings → Environment variables):
//   RESEND_API_KEY        — API key de Resend.
//   CONTRATO_FROM_EMAIL   — remitente verificado en Resend, ej. "Finite Estudio <contrato@finiteestudio.com>".
//                            Requiere que el dominio finiteestudio.com esté verificado en Resend
//                            (Resend → Domains → Add Domain → agregar los registros DNS que pida).
//                            Sin dominio verificado, Resend solo deja mandar a tu propio correo de prueba.
//   CONTRATO_NOTIFY_EMAIL — a qué correo tuyo llega la copia interna. Si no se define, cae en finite.estudio@gmail.com.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.CONTRATO_FROM_EMAIL || 'Finite Estudio <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.CONTRATO_NOTIFY_EMAIL || 'finite.estudio@gmail.com';

function money(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function sendEmail({ to, subject, html }, attachment) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: subject,
      html: html,
      attachments: attachment
        ? [{ filename: attachment.filename, content: attachment.contentBase64 }]
        : undefined,
    }),
  });

  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    throw new Error('Resend error: ' + JSON.stringify(data));
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!RESEND_API_KEY) {
    // Sin API key configurada, avisamos claro en vez de fallar en silencio.
    return {
      statusCode: 200,
      body: JSON.stringify({ enviado: false, error: 'RESEND_API_KEY no está configurada en Netlify.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  const {
    nombre, email, celular, fecha, salon, iglesia,
    paquete, precio, anticipo, saldo,
    archivo, pdfBase64,
  } = body || {};

  if (!email || !pdfBase64) {
    return { statusCode: 200, body: JSON.stringify({ enviado: false, error: 'Falta email o PDF.' }) };
  }

  const attachment = { filename: archivo || 'Contrato.pdf', contentBase64: pdfBase64 };

  const filaTabla = function (label, valor) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#6b6459;">' + label + '</td>' +
      '<td style="padding:4px 0;font-weight:600;">' + escapeHtml(valor) + '</td></tr>';
  };

  const resumenHtml =
    '<table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;">' +
    filaTabla('Pareja', nombre) +
    filaTabla('Fecha de la boda', fechaLarga(fecha)) +
    filaTabla('Salón', salon) +
    filaTabla('Iglesia', iglesia) +
    filaTabla('Paquete', paquete) +
    filaTabla('Precio total', money(precio)) +
    filaTabla('Anticipo', money(anticipo)) +
    filaTabla('Saldo restante', money(saldo)) +
    filaTabla('Celular', celular) +
    filaTabla('Correo', email) +
    '</table>';

  const htmlCliente =
    '<div style="font-family:sans-serif;color:#1a1a1a;">' +
    '<p>Hola ' + escapeHtml((nombre || '').split(' ')[0] || '') + ', gracias por firmar tu contrato de boda con Finite Estudio.</p>' +
    '<p>Aquí tienes tu copia en PDF (adjunta a este correo) y un resumen de los datos que registramos:</p>' +
    resumenHtml +
    '<p style="margin-top:20px;">Cuando gustes, puedes cubrir tu anticipo para reservar oficialmente tu fecha. Cualquier duda, escríbenos por WhatsApp.</p>' +
    '</div>';

  const htmlNegocio =
    '<div style="font-family:sans-serif;color:#1a1a1a;">' +
    '<p><b>Nuevo contrato firmado</b></p>' +
    resumenHtml +
    '</div>';

  let clienteOk = false;
  let negocioOk = false;
  const errores = [];

  try {
    await sendEmail({ to: email, subject: 'Tu contrato de boda con Finite Estudio', html: htmlCliente }, attachment);
    clienteOk = true;
  } catch (err) {
    errores.push('cliente: ' + err.message);
  }

  try {
    await sendEmail({ to: NOTIFY_EMAIL, subject: 'Nuevo contrato firmado: ' + (nombre || 'sin nombre'), html: htmlNegocio }, attachment);
    negocioOk = true;
  } catch (err) {
    errores.push('negocio: ' + err.message);
  }

  if (!clienteOk && !negocioOk) {
    console.error('Error enviando contrato por correo:', errores.join(' | '));
    return { statusCode: 200, body: JSON.stringify({ enviado: false, error: errores.join(' | ') }) };
  }

  if (errores.length) {
    console.error('Contrato: uno de los dos correos falló:', errores.join(' | '));
  }

  return { statusCode: 200, body: JSON.stringify({ enviado: true, clienteOk, negocioOk }) };
};
