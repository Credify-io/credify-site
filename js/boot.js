/* Capability gate for the WebGL layer.
   Passes -> idle-time dynamic import of /js/three-scene.js (adds html.has-3d).
   Fails -> html.no-3d; the stylesheet's default solid backgrounds are the fallback. */
(function () {
  var root = document.documentElement;

  function fallback() {
    root.classList.remove('has-3d');
    root.classList.add('no-3d');
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var weak =
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) ||
    (navigator.deviceMemory && navigator.deviceMemory < 4) ||
    conn.saveData === true;

  if (reduce || weak || !hasWebGL()) {
    fallback();
    return;
  }

  function start() {
    import('/js/three-scene.js')
      .then(function (m) { m.init(); })
      .catch(fallback);
  }

  function schedule() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(start, { timeout: 2000 });
    } else {
      setTimeout(start, 250);
    }
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule);
})();
