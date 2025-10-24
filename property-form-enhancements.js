(() => {
  const CONFIG = window.CONFIG || {};

  const CURRENCY_OPTIONS = [
    { code: 'KES', label: 'Kenyan Shilling (KES)' },
    { code: 'USD', label: 'US Dollar (USD)' },
    { code: 'EUR', label: 'Euro (EUR)' },
    { code: 'GBP', label: 'British Pound (GBP)' },
    { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
    { code: 'TZS', label: 'Tanzanian Shilling (TZS)' },
    { code: 'ZAR', label: 'South African Rand (ZAR)' },
    { code: 'INR', label: 'Indian Rupee (INR)' }
  ];

  const COUNTRY_TO_CURRENCY = {
    ke: 'KES', us: 'USD', gb: 'GBP', ug: 'UGX', tz: 'TZS', za: 'ZAR', in: 'INR',
    de: 'EUR', fr: 'EUR', it: 'EUR', es: 'EUR'
  };

  const state = {
    selectedCurrency: 'KES',
    userCurrencyManuallyChosen: false,
    rateToUSD: null
  };

  class MultiImageUpload {
    constructor(containerId, options = {}) {
      this.container = document.getElementById(containerId) || null;
      this.options = options;
      this.images = [];

      let input = this.container ? this.container.querySelector('input[type="file"]') : null;
      if (!input) input = document.getElementById('property-images');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        (this.container || document.body).appendChild(input);
      }
      input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        await this.handleFiles(files);
      });
      this.input = input;
    }

    async handleFiles(files) {
      for (const file of files) {
        const url = await this.uploadFile(file);
        if (url) this.images.push(url);
      }
    }

    async uploadFile(file) {
      const cloud = CONFIG.CLOUDINARY || {};
      if (cloud.cloudName && cloud.uploadPreset && !CONFIG.DISABLE_CLOUDINARY) {
        const form = new FormData();
        form.append('file', file);
        form.append('upload_preset', cloud.uploadPreset);
        const endpoint = `https://api.cloudinary.com/v1_1/${cloud.cloudName}/upload`;
        try {
          const resp = await fetch(endpoint, { method: 'POST', body: form });
          const data = await resp.json();
          return data.secure_url || data.url || null;
        } catch (_) {
          // fall through to base64
        }
      }
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    getImages() {
      return this.images.slice();
    }
  }

  if (!window.MultiImageUpload) window.MultiImageUpload = MultiImageUpload;

  function findPriceInput() {
    return document.getElementById('property-price') || document.querySelector('input[name="price"]');
  }

  function insertCurrencySelector() {
    if (document.getElementById('property-currency')) return true;
    const priceInput = findPriceInput();
    if (!priceInput) return false;
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    wrapper.innerHTML = `
      <label for="property-currency">Currency</label>
      <select id="property-currency"></select>
    `;
    priceInput.parentElement && priceInput.parentElement.insertAdjacentElement('afterend', wrapper);

    const select = wrapper.querySelector('#property-currency');
    CURRENCY_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.code;
      o.textContent = opt.label;
      select.appendChild(o);
    });

    const stored = localStorage.getItem('selectedCurrency');
    state.selectedCurrency = stored || 'KES';
    select.value = state.selectedCurrency;

    select.addEventListener('change', () => {
      state.selectedCurrency = select.value;
      state.userCurrencyManuallyChosen = true;
      localStorage.setItem('selectedCurrency', state.selectedCurrency);
      updatePriceUIForCurrency();
      refreshUSDRateAndHint();
    });
    return true;
  }

  function updatePriceUIForCurrency() {
    const priceLabel = document.querySelector('label[for="property-price"]');
    if (priceLabel) priceLabel.textContent = `Monthly Rent (${state.selectedCurrency})`;
    const currencySpan = document.querySelector('.price-input .currency');
    if (currencySpan) currencySpan.textContent = state.selectedCurrency;
  }

  function setupConversionHint() {
    let hint = document.getElementById('usd-price-hint');
    const priceInput = findPriceInput();
    if (!hint && priceInput) {
      hint = document.createElement('small');
      hint.id = 'usd-price-hint';
      hint.className = 'hint';
      priceInput.parentElement && priceInput.parentElement.appendChild(hint);
    }

    const input = priceInput;
    if (!input) return;
    input.addEventListener('input', () => {
      updateUSDDenomHint();
    });
  }

  function refreshUSDRateAndHint() {
    const endpoint = CONFIG.EXCHANGE_RATE_HOST || 'https://api.exchangerate.host/latest';
    fetch(`${endpoint}?base=${state.selectedCurrency}&symbols=USD`)
      .then(r => r.json())
      .then(data => {
        const rate = data?.rates?.USD;
        state.rateToUSD = typeof rate === 'number' ? rate : null;
        updateUSDDenomHint();
      })
      .catch(() => {
        state.rateToUSD = null;
        updateUSDDenomHint();
      });
  }

  function updateUSDDenomHint() {
    const hintEl = document.getElementById('usd-price-hint');
    const input = findPriceInput();
    if (!hintEl || !input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val <= 0 || !state.rateToUSD) {
      hintEl.textContent = '';
      return;
    }
    const usd = val * state.rateToUSD;
    hintEl.textContent = `≈ ${usd.toFixed(2)} USD`;
  }

  function patchMapsIntegrationForCurrency() {
    const MI = window.MapsIntegration;
    if (!MI || !MI.prototype) return;
    const proto = MI.prototype;
    if (typeof proto.updateLocationInfo === 'function') {
      const original = proto.updateLocationInfo;
      proto.updateLocationInfo = function(results) {
        const out = original.call(this, results);
        try {
          const loc = this.currentLocation || {};
          const county = loc.county || null;
          const address = loc.address || loc.formatted_address || null;
          const countryCode = (loc.countryCode || loc.country_code || '').toLowerCase();
          window.dispatchEvent(new CustomEvent('app:locationUpdated', { detail: { county, address, countryCode } }));
        } catch(_) {}
        return out;
      };
    }
  }

  function bindLocationToCurrency() {
    window.addEventListener('app:locationUpdated', (e) => {
      const { countryCode } = e.detail || {};
      const suggested = COUNTRY_TO_CURRENCY[countryCode];
      const select = document.getElementById('property-currency');
      if (!select || !suggested) return;
      if (!state.userCurrencyManuallyChosen) {
        state.selectedCurrency = suggested;
        select.value = suggested;
        updatePriceUIForCurrency();
        refreshUSDRateAndHint();
      }
    });
  }

  function patchPropertyFormSave() {
    const PF = window.PropertyForm;
    if (!PF || !PF.prototype) return;
    const proto = PF.prototype;
    const originalSave = proto.saveProperty;
    if (typeof originalSave === 'function') {
      proto.saveProperty = function() {
        const title = document.getElementById('property-title')?.value || '';
        const priceStr = findPriceInput()?.value || '';
        const priceAmount = parseFloat(priceStr) || 0;
        const currency = document.getElementById('property-currency')?.value || state.selectedCurrency || 'KES';
        const bedrooms = parseInt(document.getElementById('property-bedrooms')?.value || '0', 10);
        const bathrooms = parseFloat(document.getElementById('property-bathrooms')?.value || '0');
        const area = document.getElementById('property-area')?.value || '';
        const description = document.getElementById('property-description')?.value || '';
        const county = document.getElementById('property-county')?.value || '';
        const addressFormatted = document.getElementById('property-address')?.value || '';
        const images = this.imageUploader?.getImages ? this.imageUploader.getImages() : [];
        const location = this.mapsIntegration?.getSelectedLocation ? this.mapsIntegration.getSelectedLocation() : null;
        const ownerName = (window.Auth && typeof window.Auth.getCurrentUser === 'function') ? (window.Auth.getCurrentUser()?.name || 'Unknown') : 'Unknown';

        const property = {
          id: Date.now().toString(),
          title,
          price: `${currency} ${priceAmount}`,
          priceAmount,
          priceCurrency: currency,
          priceUSDApprox: state.rateToUSD ? (priceAmount * state.rateToUSD) : null,
          bedrooms,
          bathrooms,
          area: `${area} sq ft`,
          description,
          images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=500&q=60'],
          location,
          address: { county, formatted: addressFormatted },
          owner: ownerName,
          saved: false,
          liked: false
        };

        try {
          if (window.DataService && typeof window.DataService.addOrUpdateProperty === 'function') {
            window.DataService.addOrUpdateProperty(property);
          } else {
            window.mockProperties = window.mockProperties || [];
            window.mockProperties.push(property);
          }
        } catch (_) {
          window.mockProperties = window.mockProperties || [];
          window.mockProperties.push(property);
        }

        const modal = document.getElementById('property-form-modal');
        if (modal) modal.style.display = 'none';
        if (typeof alert === 'function') alert('Property saved successfully.');
      };
    }
  }

  function insertCountyAddressFields() {
    if (document.getElementById('property-county')) return true;
    const anchor = document.getElementById('property-location-container') || document.getElementById('map') || document.querySelector('#map-container, #property-map-container');
    if (!anchor) return false;
    const row = document.createElement('div');
    row.className = 'form-row';
    row.innerHTML = `
      <div class="form-group half">
        <label for="property-county">County</label>
        <input type="text" id="property-county" placeholder="e.g. Nairobi" required>
      </div>
      <div class="form-group half">
        <label for="property-address">Address</label>
        <input type="text" id="property-address" placeholder="Street, Estate">
      </div>
    `;
    anchor.insertAdjacentElement('afterend', row);
    return true;
  }

  function patchPropertyFormShow() {
    const PF = window.PropertyForm;
    if (!PF || !PF.prototype) return;
    const proto = PF.prototype;
    const originalShow = proto.showModal;
    if (typeof originalShow === 'function') {
      proto.showModal = function() {
        originalShow.call(this);
        insertCurrencySelector();
        updatePriceUIForCurrency();
        setupConversionHint();
        refreshUSDRateAndHint();
        patchMapsIntegrationForCurrency();
        bindLocationToCurrency();
        insertCountyAddressFields();
      };
    }
  }

  function enhanceDataService() {
    const DS = window.DataService;
    if (!DS) return;
    if (typeof DS.filterPropertiesByCounty !== 'function') {
      DS.filterPropertiesByCounty = function(county) {
        const all = typeof DS.listProperties === 'function' ? DS.listProperties() : (window.mockProperties || []);
        const c = (county || '').toLowerCase();
        return all.filter(p => (p.address?.county || '').toLowerCase() === c);
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // default currency
    const stored = localStorage.getItem('selectedCurrency');
    state.selectedCurrency = stored || 'KES';
    patchPropertyFormShow();
    patchPropertyFormSave();
    enhanceDataService();
    console.log('property-form-enhancements with currency selection loaded');
  });
})();
console.log('property-form-enhancements bootstrap loaded');