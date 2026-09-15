// contrato.js — recibe los datos + PDF del contrato ya firmado (desde
// herramientas/contrato.html) y manda DOS correos con el PDF adjunto,
// usando el propio Gmail de Finite Estudio (sin servicios externos):
//   1. A la pareja, al correo que escribió en el formulario.
//   2. A Finite Estudio, como aviso interno de que se firmó un contrato.
//
// ── Cómo activarlo (una sola vez) ──────────────────────────────────────
// 1. En la cuenta de Gmail que va a mandar los correos (finite.estudio@gmail.com):
//    - Activa la verificación en 2 pasos: myaccount.google.com/security
//    - Genera una "Contraseña de aplicación": myaccount.google.com/apppasswords
//      (elige app "Correo" / "Otra", nómbrala "Finite Estudio Web").
//      Google te da 16 caracteres, sin espacios cópialos tal cual.
//    NOTA: esto NO crea una cuenta nueva, es una llave especial para que
//    este script mande correos desde tu Gmail sin usar tu contraseña normal.
// 2. En Netlify (Site settings → Environment variables) agrega:
//    GMAIL_USER            = finite.estudio@gmail.com
//    GMAIL_APP_PASSWORD    = la contraseña de 16 caracteres de arriba
//    CONTRATO_NOTIFY_EMAIL = (opcional) si quieres que el aviso interno
//                            llegue a otro correo distinto al remitente.
// 3. Sube este archivo + package.json (ya trae "nodemailer" como dependencia)
//    para que Netlify lo instale solo en el próximo deploy.

const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const NOTIFY_EMAIL = process.env.CONTRATO_NOTIFY_EMAIL || GMAIL_USER;

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

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return cachedTransporter;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    // Sin credenciales configuradas, avisamos claro en vez de fallar en silencio.
    return {
      statusCode: 200,
      body: JSON.stringify({ enviado: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD no están configuradas en Netlify.' }),
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

  const adjunto = {
    filename: archivo || 'Contrato.pdf',
    content: pdfBase64,
    encoding: 'base64',
  };

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

  const transporter = getTransporter();
  let clienteOk = false;
  let negocioOk = false;
  const errores = [];

  try {
    await transporter.sendMail({
      from: 'Finite Estudio <' + GMAIL_USER + '>',
      to: email,
      subject: 'Tu contrato de boda con Finite Estudio',
      html: htmlCliente,
      attachments: [adjunto],
    });
    clienteOk = true;
  } catch (err) {
    errores.push('cliente: ' + err.message);
  }

  try {
    await transporter.sendMail({
      from: 'Finite Estudio <' + GMAIL_USER + '>',
      to: NOTIFY_EMAIL,
      subject: 'Nuevo contrato firmado: ' + (nombre || 'sin nombre'),
      html: htmlNegocio,
      attachments: [adjunto],
    });
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
