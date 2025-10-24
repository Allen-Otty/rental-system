// Load Kenyan county boundaries into Google Maps using Data Layer
// Uses geoBoundaries ADM1 public dataset (counties)

(function(){
  const GEOJSON_URL = 'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/KEN/ADM1/geoBoundaries-KEN-ADM1.geojson';

  function getCountyName(feature){
    // geoBoundaries often uses shapeName; fallback keys included
    return (
      feature.getProperty('shapeName') ||
      feature.getProperty('NAME_1') ||
      feature.getProperty('ADM1_NAME') ||
      feature.getProperty('NAME') ||
      'Unknown County'
    );
  }

  function styleFeature(){
    return {
      fillColor: '#2f855a',
      strokeColor: '#2b6cb0',
      strokeWeight: 1,
      fillOpacity: 0.12
    };
  }

  function highlightStyle(){
    return {
      fillColor: '#38b2ac',
      strokeColor: '#2c7a7b',
      strokeWeight: 2,
      fillOpacity: 0.25
    };
  }

  function loadKenyaBoundaries(map){
    if (!map || !google || !google.maps) return;
    const data = map.data;
    data.setStyle(styleFeature);
    data.loadGeoJson(GEOJSON_URL);

    // highlight on hover
    data.addListener('mouseover', (e) => {
      data.overrideStyle(e.feature, highlightStyle());
    });
    data.addListener('mouseout', (e) => {
      data.revertStyle(e.feature);
    });

    // click to filter property listing by county
    data.addListener('click', async (e) => {
      const county = getCountyName(e.feature);
      // Log event
      if (window.DataService) {
        window.DataService.logEvent({ type: 'county_filter', county });
      }
      // If app.js implements property feed via DataService, refresh listing
      if (window.refreshPropertyFeedByCounty) {
        window.refreshPropertyFeedByCounty(county);
      }
    });
  }

  window.loadKenyaBoundaries = loadKenyaBoundaries;
})();