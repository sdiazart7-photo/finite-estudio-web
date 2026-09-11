// Finite Estudio — comportamiento compartido del sitio

document.addEventListener('DOMContentLoaded', function () {
  // Menú móvil
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }

  // Carrusel automático de testimonios (.testi-strip), con clic para ampliar
  var testiLightbox = null;
  function ensureTestiLightbox() {
    if (testiLightbox) return testiLightbox;
    testiLightbox = document.createElement('div');
    testiLightbox.className = 'lightbox testi-lightbox';
    testiLightbox.innerHTML = '<button class="close" aria-label="Cerrar">&times;</button><img src="" alt="Testimonio ampliado">';
    document.body.appendChild(testiLightbox);
    var img = testiLightbox.querySelector('img');
    function closeTesti() {
      testiLightbox.classList.remove('open');
      img.src = '';
    }
    testiLightbox.addEventListener('click', function (e) {
      if (e.target === testiLightbox) closeTesti();
    });
    testiLightbox.querySelector('.close').addEventListener('click', closeTesti);
    document.addEventListener('keydown', function (e) {
      if (testiLightbox.classList.contains('open') && e.key === 'Escape') closeTesti();
    });
    return testiLightbox;
  }

  document.querySelectorAll('.testi-strip').forEach(function (strip) {
    var imgs = Array.from(strip.children);
    if (!imgs.length) return;
    var track = document.createElement('div');
    track.className = 'testi-track';
    imgs.forEach(function (img) { track.appendChild(img); });
    imgs.forEach(function (img) { track.appendChild(img.cloneNode(true)); });
    strip.innerHTML = '';
    strip.appendChild(track);

    track.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('click', function () {
        var lb = ensureTestiLightbox();
        lb.querySelector('img').src = img.src;
        lb.classList.add('open');
      });
    });
  });

  // Lightbox para grids de fotos (.photo-grid / .photo-grid-full img), con flechas y teclado
  var lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    var lbImg = lightbox.querySelector('img');
    var galleryImgs = [];
    var currentIndex = 0;

    function openAt(index) {
      if (!galleryImgs.length) return;
      currentIndex = (index + galleryImgs.length) % galleryImgs.length;
      var img = galleryImgs[currentIndex];
      lbImg.src = img.dataset.full || img.src;
      lightbox.classList.add('open');
    }

    function refreshGallery() {
      galleryImgs = Array.from(document.querySelectorAll('.photo-grid img, .photo-grid-full img'));
      galleryImgs.forEach(function (img, i) {
        img.addEventListener('click', function () { openAt(i); });
      });
    }
    refreshGallery();
    window.refreshLightboxGallery = refreshGallery;

    function closeLightbox() {
      lightbox.classList.remove('open');
      lbImg.src = '';
    }
    function showNext() { openAt(currentIndex + 1); }
    function showPrev() { openAt(currentIndex - 1); }

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    var closeBtn = lightbox.querySelector('.close');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    var prevBtn = lightbox.querySelector('.lb-prev');
    var nextBtn = lightbox.querySelector('.lb-next');
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); showPrev(); });
    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); showNext(); });

    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'ArrowRight') showNext();
      else if (e.key === 'ArrowLeft') showPrev();
      else if (e.key === 'Escape') closeLightbox();
    });
  }

  // Animación de aparición al hacer scroll
  var revealSelector = [
    'section .eyebrow', 'section h1', 'section h2',
    '.center-copy p', '.two-col > *', '.pkg-card', '.proceso-step',
    '.blog-card', '.faq-item', '.stepbox', '.flanked-grid > img', '.flanked-copy',
    '.mood-duo img', '.bg-fixed-content', '.article-cover-grid img',
    '.article-body h2', '.article-body p', '.article-body blockquote', '.cta-row'
  ].join(', ');
  var revealTargets = Array.from(document.querySelectorAll(revealSelector));
  revealTargets.forEach(function (el) { el.classList.add('reveal'); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('in-view'); });
  }
});
