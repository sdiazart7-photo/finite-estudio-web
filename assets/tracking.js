// =========================================================
// Finite Estudio — tracking.js
// Único lugar donde vive el Meta Pixel y todos los eventos del sitio.
// Antes: cada página cargaba su propio Pixel copiado y pegado. Ahora:
// una sola fuente de verdad, referenciada con <script src="/assets/tracking.js">.
//
// Cómo funciona la deduplicación con CAPI:
// Cada evento se genera con un event_id único y se manda DOS veces con
// el mismo ID: una desde el navegador (fbq, vía Pixel) y otra desde el
// servidor (función capi-relay → Meta Conversions API). Meta descarta
// el duplicado automáticamente y se queda con los datos de mejor calidad.
// Esto compensa lo que los bloqueadores de anuncios le esconden al Pixel.
//
// Cómo trackear un botón nuevo sin tocar este archivo:
// agrega data-track="lead" | "contact" | "cta-blog" | "view-portfolio" al elemento.
//
// OJO: si agregas un evento NUEVO al mapa EVENTOS de abajo (o lo mandas con
// window.FiniteTrack), agrégalo también a EVENTOS_PERMITIDOS en
// netlify/functions/capi-relay.js. Si no, solo viaja por Pixel y el servidor
// lo descarta en silencio (sin error visible en ningún lado).
// Si necesitas mandar un valor (ej. un monto), agrega también
// data-value="1500" data-currency="MXN".
// =========================================================

(function () {
  'use strict';

  var PIXEL_ID = '2447959342366827';
  var GA_MEASUREMENT_ID = 'G-P67NB8CXYP';

  // ---------- 0. Cargar Google Analytics 4 (una sola vez) ----------
  // Mismo principio que el Pixel de abajo: una sola fuente de verdad,
  // cargada aquí y heredada por cada página vía <script src="/assets/tracking.js">.
  // gtag ya manda su propio page_view automático al cargar — no hace
  // falta duplicarlo a mano como sí se hace con el Pixel más abajo.
  (function () {
    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
  })();

  // ---------- 1. Cargar el Meta Pixel (una sola vez) ----------
  /* eslint-disable */
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,"script",
  "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  // Apaga la "Configuración automática" de Meta ANTES del init: sin esto,
  // el Pixel adivina por su cuenta qué es cada botón (por su texto o
  // ubicación) y dispara solo eventos como "SubscribeButtonClick",
  // "Contact" o "Schedule" — duplicando lo que ya mandamos a propósito
  // más abajo. Con autoConfig en false, el ÚNICO camino para que un
  // evento salga es que este archivo lo mande explícitamente.
  fbq('set', 'autoConfig', false, PIXEL_ID);
  fbq('init', PIXEL_ID);

  // ---------- 2. Utilidades ----------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // fbc: si Meta todavía no puso la cookie _fbc, la reconstruimos a partir
  // del fbclid en la URL (llega así en el primer clic desde un anuncio).
  function getFbc() {
    var fromCookie = getCookie('_fbc');
    if (fromCookie) return fromCookie;
    var fbclid = new URLSearchParams(location.search).get('fbclid');
    return fbclid ? 'fb.1.' + Date.now() + '.' + fbclid : null;
  }

  // ---------- 3. Disparo con deduplicación Pixel + CAPI ----------
  function track(eventName, customData) {
    var eventId = uuid();
    customData = customData || {};

    fbq('track', eventName, customData, { eventID: eventId });

    var payload = JSON.stringify({
      eventName: eventName,
      eventId: eventId,
      eventSourceUrl: location.href,
      customData: customData,
      fbp: getCookie('_fbp'),
      fbc: getFbc(),
    });

    // sendBeacon no bloquea la navegación si el clic también abre WhatsApp o Cal.com
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/.netlify/functions/capi-relay', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/.netlify/functions/capi-relay', { method: 'POST', body: payload, keepalive: true }).catch(function () {});
    }
  }

  // ---------- 4. PageView (todas las páginas) ----------
  track('PageView');

  // ---------- 5. Eventos por clic: data-track="clave" en cualquier botón o link ----------
  // Mapa cerrado a propósito: una clave que no está aquí no manda nada,
  // así ningún botón nuevo empieza a ensuciar el Administrador de Eventos por accidente.
  var EVENTOS = {
    'lead': 'InteresadoEnCita',         // (personalizado) Dio clic en "Agendar videollamada o cafecito" o envió el formulario de contacto — SOLO interés, todavía no agendó de verdad. El agendado real es "Schedule", ver más abajo.
    'contact': 'Contact',               // SOLO links que abren WhatsApp con un prospecto (home, /infoprecios/, /propuesta/, /love-season/). Nada de navegación interna ni clientes que ya firmaron.
    'cta-blog': 'ClicCTABlog',          // (personalizado) Clic en un botón de un artículo del blog que lleva al contacto del home. Paso intermedio: todavía no escribió.
    'view-portfolio': 'VerPortafolio',  // Ver portafolio (evento personalizado)
    'checkout': 'InitiateCheckout',     // Inicio de compra: Firmar contrato y recibir PDF (contrato.html). El InitiateCheckout de pago.html es automático al cargar la página, no por clic — ver sección 6.
    'checkout-tarjeta': 'SolicitudTarjeta', // (personalizado) Clic en "Solicitar pago con tarjeta" en pago.html — evento aparte del InitiateCheckout automático de esa misma página, para no mezclar "llegó a pagar" con "pidió pagar con tarjeta".
    'purchase': 'Purchase',             // Envía comprobante de pago del anticipo
  };
  // "VerPaquetes" (personalizado) NO está aquí a propósito: no es un clic,
  // es llegar al paso "Paquetes" del quiz en /propuesta/. Se dispara directo
  // con window.FiniteTrack desde el goTo() de esa página. Ver ese archivo.
  // "Cliente potencial" (Schedule) y "Programar" NO están aquí a propósito:
  // se confirman del lado del servidor cuando Cal.com avisa que la cita
  // quedó agendada de verdad (netlify/functions/cal-webhook.js), no con un
  // clic que solo ABRE el calendario. Ver ese archivo para esos dos eventos.

  // Eventos que cuentan PERSONAS, no clics: se mandan una sola vez por
  // navegador cada 24 horas, sin importar cuántos botones distintos toque,
  // cuántas veces recargue o si vuelve a entrar el mismo día.
  // Por qué: /infoprecios/ tiene 6 botones de WhatsApp y antes cada uno
  // disparaba su propio Contact, así que una sola pareja indecisa podía
  // valer 6 "contactos" en Meta. Con esto, Contact ≈ personas que abrieron
  // WhatsApp, y el algoritmo aprende con un número honesto.
  var UNA_VEZ_POR_PERSONA = { 'Contact': true };
  var VENTANA_MS = 24 * 60 * 60 * 1000;
  var memoria = {}; // respaldo si el navegador bloquea localStorage (modo incógnito estricto, algunos navegadores in-app)

  function yaSeMando(eventName) {
    var key = 'finite_evt_' + eventName;
    var ultimo = memoria[key];
    try { ultimo = ultimo || parseInt(localStorage.getItem(key), 10); } catch (err) {}
    return !!ultimo && (Date.now() - ultimo) < VENTANA_MS;
  }

  function marcarMandado(eventName) {
    var key = 'finite_evt_' + eventName;
    memoria[key] = Date.now();
    try { localStorage.setItem(key, String(memoria[key])); } catch (err) {}
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (!el) return;
    var eventName = EVENTOS[el.getAttribute('data-track')];
    if (!eventName) return;

    // Seguro 1 (eventos de personas, ej. Contact): una vez cada 24 h por navegador.
    // El clic sigue abriendo WhatsApp normal; solo se omite el evento repetido.
    if (UNA_VEZ_POR_PERSONA[eventName]) {
      if (yaSeMando(eventName)) return;
      marcarMandado(eventName);
    }

    // Seguro 2 (todos los demás): un mismo botón no vuelve a mandar su
    // evento en lo que dure la visita (doble clic accidental).
    if (el.dataset.finiteTracked) return;
    el.dataset.finiteTracked = '1';

    var customData = {};
    if (el.dataset.value) customData.value = parseFloat(el.dataset.value);
    if (el.dataset.currency) customData.currency = el.dataset.currency;
    track(eventName, customData);
  });

  // ---------- 6. Eventos automáticos según el tipo de página ----------
  // <body data-page-type="..."> se define en cada plantilla, no aquí.
  // Este script carga en el <head>, donde document.body todavia no existe:
  // se espera al DOM para leer data-page-type (antes lanzaba un TypeError y
  // window.FiniteTrack nunca llegaba a definirse).
  function runPageEvents() {
  var pageType = document.body.getAttribute('data-page-type');

  if (pageType === 'blog-post') {
    track('VerBlog'); // alguien abrió un artículo del blog
  }

  if (pageType === 'checkout') {
    // Llega a la página de pago con ?anticipo=1234 en la URL (ver herramientas/pago.html)
    var anticipo = parseFloat(new URLSearchParams(location.search).get('anticipo'));
    track('InitiateCheckout', anticipo ? { value: anticipo, currency: 'MXN' } : {});
  }

  if (pageType !== 'blog-post' && document.referrer.indexOf('/blog/') !== -1) {
    track('InicioBlog'); // llegó aquí con un clic que venía de un artículo del blog
  }
  }
  if (document.body) { runPageEvents(); } else { document.addEventListener('DOMContentLoaded', runPageEvents); }

  // Disponible por si alguna página necesita mandar un evento con datos dinámicos
  // (ej. el botón de "Enviar comprobante" en pago.html, que ya trae el monto).
  window.FiniteTrack = track;
})();
