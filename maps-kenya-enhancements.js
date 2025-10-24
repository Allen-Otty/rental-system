// Enhancements that center map to Kenya and overlay county boundaries
(function(){
  const NAIROBI_CENTER = { lat: -1.286389, lng: 36.817223 };

  function tryEnhance(){
    const mi = window.mapsIntegration;
    if (mi && mi.map && google && google.maps) {
      // Center to Nairobi
      mi.map.setCenter(NAIROBI_CENTER);
      mi.map.setZoom(10);
      // Load boundaries overlay if available
      if (typeof window.loadKenyaBoundaries === 'function') {
        window.loadKenyaBoundaries(mi.map);
      }
      return true;
    }
    return false;
  }

  function init(){
    // Attempt immediately and then retry a few times as Google script loads asynchronously
    let attempts = 0;
    const maxAttempts = 50; // ~5s at 100ms
    const timer = setInterval(() => {
      attempts++;
      if (tryEnhance() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 100);
  }

  document.addEventListener('DOMContentLoaded', init);
})();