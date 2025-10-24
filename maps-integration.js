// Google Maps integration for property location pinning
class MapsIntegration {
    constructor() {
        this.map = null;
        this.markers = [];
        this.selectedLocation = null;
        this.selectedAddress = null; // { country, county, address }
        this.onLocationUpdate = null; // callback(info)
        this.targetContainerId = null;
        this.apiKey = (window.CONFIG && window.CONFIG.GOOGLE_MAPS_API_KEY) || 'YOUR_GOOGLE_MAPS_API_KEY';
        this.loadGoogleMapsScript();
    }

    loadGoogleMapsScript() {
        // Check if script is already loaded
        if (window.google && window.google.maps) {
            this.initMap();
            return;
        }

        // Create script element
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => this.initMap();
        document.head.appendChild(script);
    }

    initMap(targetContainerId = null) {
        // Create map container if it doesn't exist
        this.targetContainerId = targetContainerId;
        if (!document.getElementById('property-map-container')) {
            this.createMapInterface(targetContainerId);
        }

        // Initialize map
        const mapContainer = document.getElementById('property-map');
        if (!mapContainer) return;

        // Default center (set to Nairobi, Kenya)
        const defaultCenter = { lat:  -1.286389, lng: 36.817223 };

        this.map = new google.maps.Map(mapContainer, {
            center: defaultCenter,
            zoom: 13,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true
        });

        // Add search box
        this.addSearchBox();

        // Add click listener for pin dropping
        this.map.addListener('click', (event) => {
            this.placeMarker(event.latLng);
        });

        // If we're viewing a property with location, show it
        this.showPropertyLocation();

        // Load Kenya administrative boundaries overlay (ADM1 - Counties)
        this.loadKenyaBoundaries();
    }

    createMapInterface(targetContainerId = null) {
        const mapHTML = `
            <div id="property-map-container" class="map-container">
                <h3>Property Location</h3>
                <div class="map-search-container">
                    <input id="map-search-input" type="text" placeholder="Search for a location">
                </div>
                <div id="property-map" class="property-map"></div>
                <div class="map-controls">
                    <button id="save-location-button" class="btn">Save Location</button>
                    <button id="reset-location-button" class="btn btn-secondary">Reset</button>
                </div>
                <div id="selected-location-info" class="location-info"></div>
            </div>
        `;
        
        if (targetContainerId) {
            // Prefer rendering inside the provided container
            const host = document.getElementById(targetContainerId);
            if (host) {
                host.innerHTML = mapHTML;
            } else {
                // Fallback to body if container not found
                const fallback = document.createElement('div');
                fallback.innerHTML = mapHTML;
                document.body.appendChild(fallback);
            }
        } else {
            // Add to landlord dashboard if it exists (for adding properties)
            const landlordDashboard = document.querySelector('.landlord-dashboard');
            if (landlordDashboard) {
                const mapSection = document.createElement('div');
                mapSection.className = 'dashboard-section';
                mapSection.innerHTML = mapHTML;
                landlordDashboard.appendChild(mapSection);
            } else {
                // Add to property details if it exists (for viewing properties)
                const propertyDetails = document.querySelector('.property-details-content');
                if (propertyDetails) {
                    const mapSection = document.createElement('div');
                    mapSection.innerHTML = mapHTML;
                    propertyDetails.appendChild(mapSection);
                } else {
                    // Fallback - add to property form if it exists
                    const propertyForm = document.querySelector('.property-form') || document.body;
                    const mapSection = document.createElement('div');
                    mapSection.innerHTML = mapHTML;
                    propertyForm.appendChild(mapSection);
                }
            }
        }

        // Add event listeners
        document.getElementById('save-location-button').addEventListener('click', () => this.saveLocation());
        document.getElementById('reset-location-button').addEventListener('click', () => this.resetMarkers());
    }

    addSearchBox() {
        const input = document.getElementById('map-search-input');
        if (!input) return;

        const searchBox = new google.maps.places.SearchBox(input);
        
        // Bias the SearchBox results towards current map's viewport
        this.map.addListener('bounds_changed', () => {
            searchBox.setBounds(this.map.getBounds());
        });

        // Listen for the event fired when the user selects a prediction and retrieve
        // more details for that place.
        searchBox.addListener('places_changed', () => {
            const places = searchBox.getPlaces();

            if (places.length === 0) return;

            // For each place, get the icon, name and location.
            const bounds = new google.maps.LatLngBounds();
            
            places.forEach(place => {
                if (!place.geometry || !place.geometry.location) return;

                // Place a marker for the selected location
                this.placeMarker(place.geometry.location);

                if (place.geometry.viewport) {
                    // Only geocodes have viewport.
                    bounds.union(place.geometry.viewport);
                } else {
                    bounds.extend(place.geometry.location);
                }
            });
            
            this.map.fitBounds(bounds);
        });
    }

    placeMarker(location) {
        // Clear existing markers
        this.resetMarkers();
        
        // Create new marker
        const marker = new google.maps.Marker({
            position: location,
            map: this.map,
            draggable: true,
            animation: google.maps.Animation.DROP
        });
        
        this.markers.push(marker);
        this.selectedLocation = {
            lat: location.lat(),
            lng: location.lng()
        };
        
        // Update location info
        this.updateLocationInfo();
        
        // Add drag end listener to update location
        marker.addListener('dragend', () => {
            this.selectedLocation = {
                lat: marker.getPosition().lat(),
                lng: marker.getPosition().lng()
            };
            this.updateLocationInfo();
        });
    }

    updateLocationInfo() {
        const infoContainer = document.getElementById('selected-location-info');
        if (!infoContainer || !this.selectedLocation) return;
        
        // Reverse geocode to get address
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: this.selectedLocation }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const address = results[0];
                // Extract country and county
                let country = null;
                let county = null;
                const comps = address.address_components || [];
                comps.forEach(c => {
                    if (c.types.includes('country')) country = c.long_name;
                    if (c.types.includes('administrative_area_level_1')) county = c.long_name;
                });
                this.selectedAddress = { country, county, address: address.formatted_address };
                infoContainer.innerHTML = `
                    <p><strong>Selected Location:</strong> ${address.formatted_address}</p>
                    <p><strong>Coordinates:</strong> ${this.selectedLocation.lat.toFixed(6)}, ${this.selectedLocation.lng.toFixed(6)}</p>
                    ${country ? `<p><strong>Country:</strong> ${country}</p>` : ''}
                    ${county ? `<p><strong>County:</strong> ${county}</p>` : ''}
                `;
                // Notify listeners
                if (typeof this.onLocationUpdate === 'function') {
                    this.onLocationUpdate({
                        address: address.formatted_address,
                        coords: this.selectedLocation,
                        country,
                        county
                    });
                }
            } else {
                infoContainer.innerHTML = `
                    <p><strong>Selected Location:</strong> Custom Pin</p>
                    <p><strong>Coordinates:</strong> ${this.selectedLocation.lat.toFixed(6)}, ${this.selectedLocation.lng.toFixed(6)}</p>
                `;
            }
        });
    }

    resetMarkers() {
        // Remove all markers from the map
        this.markers.forEach(marker => marker.setMap(null));
        this.markers = [];
        this.selectedLocation = null;
        
        // Clear location info
        const infoContainer = document.getElementById('selected-location-info');
        if (infoContainer) {
            infoContainer.innerHTML = '';
        }
    }

    saveLocation() {
        if (!this.selectedLocation) {
            alert('Please select a location on the map first.');
            return;
        }
        // Enforce Kenya-only locations
        if (this.selectedAddress && this.selectedAddress.country && this.selectedAddress.country.toLowerCase() !== 'kenya') {
            alert('Selected location is outside Kenya. Please pick a location within Kenyan boundaries.');
            return;
        }
        
        // Save location to property data
        if (window.currentProperty) {
            window.currentProperty.location = this.selectedLocation;
            alert('Location saved successfully!');
        } else {
            // Store in localStorage for later use
            localStorage.setItem('pendingPropertyLocation', JSON.stringify(this.selectedLocation));
            alert('Location saved. It will be applied when you create a property.');
        }
    }

    showPropertyLocation() {
        // Check if we're viewing a property with location data
        if (window.currentProperty && window.currentProperty.location) {
            const location = window.currentProperty.location;
            const latLng = new google.maps.LatLng(location.lat, location.lng);
            this.placeMarker(latLng);
            this.map.setCenter(latLng);
        }
    }

    getSelectedLocation() {
        return this.selectedLocation;
    }

    setOnLocationUpdate(cb) {
        this.onLocationUpdate = cb;
    }

    loadKenyaBoundaries() {
        try {
            const apiUrl = (window.CONFIG && window.CONFIG.GEOBOUNDARIES_ADM1_URL) || 'https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM1';
            fetch(apiUrl)
                .then(r => r.json())
                .then(data => {
                    const record = Array.isArray(data) ? data[0] : null;
                    const gjUrl = record?.gjDownloadURL || record?.simplifiedGeometryGeoJSON || record?.shapeFile?.gjDownloadURL;
                    if (!gjUrl) return;
                    this.map.data.loadGeoJson(gjUrl);
                    this.map.data.setStyle({ fillColor: '#2e7d32', fillOpacity: 0.08, strokeColor: '#1b5e20', strokeWeight: 1 });
                    this.map.data.addListener('click', (e) => {
                        const name = e.feature.getProperty('shapeName') || e.feature.getProperty('NAME_1') || 'County';
                        if (typeof showNotification === 'function') {
                            showNotification(`Boundary: ${name}`, 'info');
                        }
                    });
                })
                .catch(() => {/* ignore errors for now */});
        } catch (e) {
            // ignore
        }
    }
}

// Initialize maps integration when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize for both landlords (to add locations) and all users (to view locations)
    window.mapsIntegration = new MapsIntegration();
});