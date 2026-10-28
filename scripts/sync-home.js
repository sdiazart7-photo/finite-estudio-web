#!/usr/bin/env node
/**
 * scripts/sync-home.js — Finite Estudio
 *
 * Escribe en index.html, como HTML estático, el portafolio y las preguntas
 * frecuentes del inicio (más el schema FAQPage), a partir de los arreglos de
 * JavaScript que ya existen en ese mismo archivo (portfolioImages,
 * portfolioAlts y faqs) y que edita el panel.
 *
 * Por qué: antes esos bloques llegaban vacíos en el HTML y los pintaba
 * JavaScript. Google y las IAs que no ejecutan JS veían una página sin fotos
 * ni preguntas. Ahora el HTML ya trae todo, y el JS del inicio solo "se
 * engancha" a lo que encuentra.
 *
 * La huella (data-hash) es la llave de seguridad: si alguien cambia los
 * arreglos desde el panel y todavía no corre este script, la huella no
 * coincide y el navegador repinta esos bloques como antes. Nada se rompe; solo
 * los buscadores verían la versión anterior hasta la siguiente sincronización.
 *
 * Uso (desde la raíz del repo, sin instalar nada):
 *   node scripts/sync-home.js           # reescribe index.html
 *   node scripts/sync-home.js --check   # solo avisa si está desactualizado (sale con código 1)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'index.html');
const CHECK = process.argv.includes('--check');
let html = fs.readFileSync(FILE, 'utf8');

// Misma función que usa index.html en el navegador. Si cambias una, cambia la otra.
function hash(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}

// Lee un arreglo literal "var nombre = [ ... ];" respetando comillas y comentarios.
function leerArreglo(src, nombre) {
  const m = new RegExp('var\\s+' + nombre + '\\s*=\\s*\\[').exec(src);
  if (!m) throw new Error('No encontré "var ' + nombre + ' = [" en index.html');
  const open = m.index + m[0].length - 1;
  let depth = 0;
  let q = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) {
      return vm.runInNewContext('(' + src.slice(open, i + 1) + ')', Object.create(null), { timeout: 1000 });
    }
  }
  throw new Error('El arreglo ' + nombre + ' no cierra');
}

const images = leerArreglo(html, 'portfolioImages');
const alts = leerArreglo(html, 'portfolioAlts');
const faqs = leerArreglo(html, 'faqs');

const portHash = hash(JSON.stringify([images, alts]));
const faqHash = hash(JSON.stringify(faqs));

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const sinTags = (v) => String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Portafolio: filas de 3 (versión escritorio). En celular el JS lo reorganiza a 2 por fila.
const PER_ROW = 3;
function portfolioHtml() {
  const rows = [];
  for (let r = 0; r * PER_ROW < images.length; r++) {
    const tiles = images.slice(r * PER_ROW, r * PER_ROW + PER_ROW).map((src, i) => {
      const idx = r * PER_ROW + i;
      return '<div class="port-tile" role="button" tabindex="0"><img loading="lazy" src="' + esc(src) + '" alt="' + esc(alts[idx] || '') + '"></div>';
    });
    rows.push('<div class="port-row" style="--i:' + r + '">' + tiles.join('') + '</div>');
  }
  return rows.join('\n');
}

function faqHtml() {
  return faqs.map((f) =>
    '<div class="faq-item reveal"><button class="faq-q"><span>' + f[0] + '</span><span class="plus">+</span></button><div class="faq-a"><p>' + f[1] + '</p></div></div>'
  ).join('\n');
}

function faqSchema() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: sinTags(f[0]),
      acceptedAnswer: { '@type': 'Answer', text: sinTags(f[1]) },
    })),
  };
  return '<script type="application/ld+json">\n' + JSON.stringify(data, null, 2).replace(/</g, '\\u003c') + '\n</script>';
}

function reemplazarBloque(src, nombre, contenido) {
  const re = new RegExp('(<!--sync:' + nombre + '-->)[\\s\\S]*?(<!--/sync:' + nombre + '-->)');
  if (!re.test(src)) throw new Error('Falta el marcador <!--sync:' + nombre + '--> en index.html');
  return src.replace(re, (_, a, b) => a + '\n' + contenido + '\n' + b);
}

function fijarAtributos(src, id, attrs) {
  const re = new RegExp('<div([^>]*)\\bid="' + id + '"([^>]*)>');
  const m = re.exec(src);
  if (!m) throw new Error('No encontré el contenedor #' + id);
  let tag = m[0].replace(/\sdata-hash="[^"]*"/g, '').replace(/\sdata-perrow="[^"]*"/g, '');
  const extra = Object.keys(attrs).map((k) => ' ' + k + '="' + attrs[k] + '"').join('');
  tag = tag.replace(/>$/, extra + '>');
  return src.replace(m[0], tag);
}

let nuevo = html;
nuevo = reemplazarBloque(nuevo, 'portGrid', portfolioHtml());
nuevo = reemplazarBloque(nuevo, 'faqList', faqHtml());
nuevo = reemplazarBloque(nuevo, 'faqSchema', faqSchema());
nuevo = fijarAtributos(nuevo, 'portGrid', { 'data-hash': portHash, 'data-perrow': String(PER_ROW) });
nuevo = fijarAtributos(nuevo, 'faqList', { 'data-hash': faqHash });

if (nuevo === html) {
  console.log('index.html ya estaba sincronizado.');
  process.exit(0);
}
if (CHECK) {
  console.error('index.html está desactualizado: corre "node scripts/sync-home.js".');
  process.exit(1);
}
fs.writeFileSync(FILE, nuevo);
console.log('index.html sincronizado: ' + images.length + ' fotos, ' + faqs.length + ' preguntas.');
