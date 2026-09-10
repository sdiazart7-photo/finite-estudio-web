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

  // Carrusel automático de testimonios (.testi-strip)
  document.querySelectorAll('.testi-strip').forEach(function (strip) {
    var imgs = Array.from(strip.children);
    if (!imgs.length) return;
    var track = document.createElement('div');
    track.className = 'testi-track';
    imgs.forEach(function (img) { track.appendChild(img); });
    imgs.forEach(function (img) { track.appendChild(img.cloneNode(true)); });
    strip.innerHTML = '';
    strip.appendChild(track);
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
});
