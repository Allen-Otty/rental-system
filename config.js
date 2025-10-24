// Runtime configuration for APIs, maps, and app defaults
(function(){
  // Base config object
  window.CONFIG = {
    // Map defaults (center Nairobi, Kenya)
    DEFAULT_MAP_CENTER: { lat: -1.286389, lng: 36.817223 },
    DEFAULT_MAP_ZOOM: 12,

    // Kenya bounding box (approximate)
    KENYA_BOUNDS: {
      latMin: -5.05,
      latMax: 5.05,
      lngMin: 33.5,
      lngMax: 42.5
    },

    // API keys (set actual keys in production via env or secrets manager)
    APIS: {
      GOOGLE_MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY',
      OPENCAGE_API_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      AFRICAS_TALKING_API_KEY: '',
      AFRICAS_TALKING_USERNAME: ''
    },

    // Public datasets / endpoints
    DATASETS: {
      KENYA_COUNTIES_GEOJSON:
        'https://raw.githubusercontent.com/mikelmaron/kenya-election-data/master/data/counties.geojson'
    },

    // External API endpoints used by UI enhancements
    EXCHANGE_RATE_HOST: 'https://api.exchangerate.host/latest',

    // GeoBoundaries API for ADM1 (Counties)
    GEOBOUNDARIES_ADM1_URL: 'https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM1',

    // Cloudinary upload config (leave empty to use base64 previews)
    CLOUDINARY: {
      cloudName: '',
      uploadPreset: ''
    },
    DISABLE_CLOUDINARY: true, // set to false when cloudName and uploadPreset are provided

    // Client caching settings
    CACHE: {
      maxEntries: 100,
      defaultTTLms: 10 * 60 * 1000 // 10 minutes
    }
  };

  // Aliases for consumers expecting top-level keys
  window.CONFIG.GOOGLE_MAPS_API_KEY = window.CONFIG.APIS.GOOGLE_MAPS_API_KEY;

  // Provide APP_CONFIG alias for services expecting it
  window.APP_CONFIG = window.APP_CONFIG || window.CONFIG;
})();