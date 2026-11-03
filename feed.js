// Renders the home feed from DataService (the swipe buttons below it are not wired yet).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function imageUrl(p) {
    const img = Array.isArray(p.images) && p.images[0];
    if (!img) return '';
    return /^https:\/\/images\.unsplash\.com\/[^?]*$/.test(img) ? img + '?auto=format&fit=crop&w=600&q=60' : img;
  }

  function placeLine(p) {
    const a = p.address || {};
    if (a.formatted) return a.formatted;
    const parts = [a.city, a.county].filter(Boolean);
    if (parts.length) return parts.filter((x, i) => parts.indexOf(x) === i).join(', ');
    return typeof p.location === 'string' ? p.location : '';
  }

  function card(p) {
    const beds = p.bedrooms === 0 ? 'Studio' : (p.bedrooms != null ? `${esc(p.bedrooms)} bed` : '');
    const meta = [beds, p.bathrooms != null ? `${esc(p.bathrooms)} bath` : '', p.area ? esc(p.area) : ''].filter(Boolean).join(' · ');
    const src = imageUrl(p);
    return `<article class="feed-card">
      ${src ? `<img src="${esc(src)}" alt="${esc(p.title)}" loading="lazy">` : '<div class="feed-noimg">No photo</div>'}
      <div class="feed-body">
        <h3>${esc(p.title)}</h3>
        <p class="feed-price">${esc(p.price)}</p>
        <p class="feed-place">${esc(placeLine(p))}</p>
        <p class="feed-meta">${meta}</p>
      </div>
    </article>`;
  }

  async function render() {
    const feed = document.getElementById('property-feed');
    if (!feed || !window.DataService) return;
    try {
      const list = await window.DataService.getProperties();
      feed.innerHTML = list.length
        ? list.map(card).join('')
        : '<p class="feed-empty">No listings yet. Landlords can log in and add the first one.</p>';
    } catch (err) {
      feed.innerHTML = '<p class="feed-empty">Could not load listings.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('properties:changed', render);
})();
