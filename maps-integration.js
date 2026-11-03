// Map integration for property location pinning, built on Leaflet + OpenStreetMap.
// No API key needed. Search and reverse geocoding use OpenStreetMap's Nominatim service
// (light use only; move to a hosted geocoder if traffic grows).
class MapsIntegration {
    constructor() {
        this.map = null;
        this.markers = [];
        this.boundaryLayer = null;
        this.selectedLocation = null;
        this.selectedAddress = null; // { country, county, address }
        this.currentLocation = null; // { county, address, countryCode } (read by property-form-enhancements)
        this.onLocationUpdate = null; // callback(info)
        this.targetContainerId = null;
        this._searchTimer = null;
    }

    // Only draws a map when asked (the property form passes a container id).
    // It no longer injects a map into the home page on load.
    initMap(targetContainerId = null) {
        if (typeof L === 'undefined') {
            console.warn('Leaflet failed to load; map unavailable.');
            return;
        }
        this.targetContainerId = targetContainerId;
        if (this.map) { this.map.remove(); this.map = null; this.markers = []; }
        if (!targetContainerId && !document.querySelector('.landlord-dashboard, .property-details-content')) return;
        this.createMapInterface(targetContainerId);

        const mapContainer = document.getElementById('property-map');
        if (!mapContainer) return;

        const nairobi = [-1.286389, 36.817223];
        this.map = L.map(mapContainer).setView(nairobi, 11);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        this.map.on('click', (e) => this.placeMarker(e.latlng));
        this.addSearchBox();
        this.showPropertyLocation();
        this.loadKenyaBoundaries();
        // The form modal may still be animating open; fix tile sizing.
        setTimeout(() => this.map && this.map.invalidateSize(), 200);
    }

    createMapInterface(targetContainerId = null) {
        const mapHTML = `
            <div id="property-map-container" class="map-container">
                <h3>Property Location</h3>
                <div class="map-search-container">
                    <input id="map-search-input" type="text" placeholder="Search for a location in Kenya" autocomplete="off">
                    <ul id="map-search-results" class="map-search-results"></ul>
                </div>
                <div id="property-map" class="property-map"></div>
                <div class="map-controls">
                    <button type="button" id="save-location-button" class="btn">Save Location</button>
                    <button type="button" id="reset-location-button" class="btn btn-secondary">Reset</button>
                </div>
                <div id="selected-location-info" class="location-info"></div>
            </div>
        `;
        const host = targetContainerId && document.getElementById(targetContainerId);
        if (host) {
            host.innerHTML = mapHTML;
        } else {
            const parent = document.querySelector('.landlord-dashboard') ||
                           document.querySelector('.property-details-content');
            if (!parent) return;
            const section = document.createElement('div');
            section.innerHTML = mapHTML;
            parent.appendChild(section);
        }
        document.getElementById('save-location-button').addEventListener('click', () => this.saveLocation());
        document.getElementById('reset-location-button').addEventListener('click', () => this.resetMarkers());
    }

    addSearchBox() {
        const input = document.getElementById('map-search-input');
        const list = document.getElementById('map-search-results');
        if (!input || !list) return;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
        input.addEventListener('input', () => {
            clearTimeout(this._searchTimer);
            const q = input.value.trim();
            if (q.length < 3) { list.innerHTML = ''; return; }
            this._searchTimer = setTimeout(async () => {
                try {
                    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ke&q=' + encodeURIComponent(q);
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    const items = await res.json();
                    list.innerHTML = '';
                    items.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item.display_name;
                        li.addEventListener('click', () => {
                            list.innerHTML = '';
                            input.value = item.display_name;
                            const ll = L.latLng(parseFloat(item.lat), parseFloat(item.lon));
                            this.map.setView(ll, 16);
                            this.placeMarker(ll);
                        });
                        list.appendChild(li);
                    });
                } catch (err) {
                    console.warn('Location search failed:', err.message);
                }
            }, 400);
        });
    }

    placeMarker(latlng) {
        this.resetMarkers();
        const marker = L.marker(latlng, { draggable: true }).addTo(this.map);
        this.markers.push(marker);
        this.selectedLocation = { lat: latlng.lat, lng: latlng.lng };
        this.updateLocationInfo();
        marker.on('dragend', () => {
            const p = marker.getLatLng();
            this.selectedLocation = { lat: p.lat, lng: p.lng };
            this.updateLocationInfo();
        });
    }

    async updateLocationInfo() {
        const infoContainer = document.getElementById('selected-location-info');
        if (!infoContainer || !this.selectedLocation) return;
        const { lat, lng } = this.selectedLocation;
        const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=17&lat=${lat}&lon=${lng}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            const data = await res.json();
            if (!data || data.error) throw new Error('no address');
            const a = data.address || {};
            const country = a.country || null;
            const county = (a.county || a.state || '').replace(/\s+County$/i, '') || null;
            const address = data.display_name;
            this.selectedAddress = { country, county, address };
            this.currentLocation = { county, address, countryCode: a.country_code || '' };
            const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            infoContainer.innerHTML = `
                <p><strong>Selected Location:</strong> ${esc(address)}</p>
                <p><strong>Coordinates:</strong> ${coords}</p>
                ${country ? `<p><strong>Country:</strong> ${esc(country)}</p>` : ''}
                ${county ? `<p><strong>County:</strong> ${esc(county)}</p>` : ''}`;
            if (typeof this.onLocationUpdate === 'function') {
                this.onLocationUpdate({ address, coords: this.selectedLocation, country, county });
            }
            window.dispatchEvent(new CustomEvent('app:locationUpdated', {
                detail: { county, address, countryCode: (a.country_code || '').toLowerCase() }
            }));
            const countyInput = document.getElementById('property-county');
            if (countyInput && county && !countyInput.value) countyInput.value = county;
        } catch (err) {
            infoContainer.innerHTML = `
                <p><strong>Selected Location:</strong> Custom Pin</p>
                <p><strong>Coordinates:</strong> ${coords}</p>`;
        }
    }

    resetMarkers() {
        this.markers.forEach(m => m.remove());
        this.markers = [];
        this.selectedLocation = null;
        const infoContainer = document.getElementById('selected-location-info');
        if (infoContainer) infoContainer.innerHTML = '';
    }

    saveLocation() {
        if (!this.selectedLocation) {
            alert('Please select a location on the map first.');
            return;
        }
        if (this.selectedAddress && this.selectedAddress.country && this.selectedAddress.country.toLowerCase() !== 'kenya') {
            alert('Selected location is outside Kenya. Please pick a location within Kenyan boundaries.');
            return;
        }
        if (window.currentProperty) {
            window.currentProperty.location = this.selectedLocation;
            alert('Location saved successfully!');
        } else {
            localStorage.setItem('pendingPropertyLocation', JSON.stringify(this.selectedLocation));
            alert('Location saved. It will be applied when you create a property.');
        }
    }

    showPropertyLocation() {
        if (window.currentProperty && window.currentProperty.location) {
            const { lat, lng } = window.currentProperty.location;
            const ll = L.latLng(lat, lng);
            this.placeMarker(ll);
            this.map.setView(ll, 15);
        }
    }

    getSelectedLocation() {
        return this.selectedLocation;
    }

    setOnLocationUpdate(cb) {
        this.onLocationUpdate = cb;
    }

    // County outlines (best effort; the map works without them).
    async loadKenyaBoundaries() {
        const urls = [
            'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/KEN/ADM1/geoBoundaries-KEN-ADM1_simplified.geojson',
            (window.CONFIG && window.CONFIG.DATASETS && window.CONFIG.DATASETS.KENYA_COUNTIES_GEOJSON) ||
                'https://raw.githubusercontent.com/mikelmaron/kenya-election-data/master/data/counties.geojson'
        ];
        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const geo = await res.json();
                if (!this.map) return;
                if (this.boundaryLayer) this.boundaryLayer.remove();
                this.boundaryLayer = L.geoJSON(geo, {
                    style: { color: '#1b5e20', weight: 1, fillColor: '#2e7d32', fillOpacity: 0.06 },
                    onEachFeature: (f, layer) => {
                        const p = f.properties || {};
                        const name = p.shapeName || p.NAME_1 || p.COUNTY || p.NAME || 'County';
                        layer.bindTooltip(String(name), { sticky: true });
                    }
                }).addTo(this.map);
                // Clicks on a county should still drop a pin.
                this.boundaryLayer.on('click', (e) => this.placeMarker(e.latlng));
                return;
            } catch (err) {
                console.warn('Boundary load failed:', err.message);
            }
        }
    }
}

// One shared instance; it draws nothing until the property form asks for a map.
document.addEventListener('DOMContentLoaded', () => {
    window.mapsIntegration = new MapsIntegration();
});
