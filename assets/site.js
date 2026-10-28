// Finite Estudio — comportamiento compartido: menú móvil de la cápsula de navegación
(function(){
  var t=document.getElementById('navToggle'),l=document.getElementById('navLinks');
  if(!t||!l)return;
  t.addEventListener('click',function(){var o=l.classList.toggle('open');t.textContent=o?'✕':'☰';t.setAttribute('aria-expanded',o);});
  l.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){l.classList.remove('open');t.textContent='☰';t.setAttribute('aria-expanded','false');});});
})();
