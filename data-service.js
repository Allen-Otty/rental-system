// DataService: Repository pattern with local and optional cloud providers
// Provides smooth operations with Maps/Sets and pluggable backends

(function(){
  const STORAGE_KEYS = {
    properties: 'rs_properties',
    users: 'rs_users',
    savedByUser: 'rs_saved_by_user',
    events: 'rs_events'
  };

  class LocalRepository {
    constructor(){
      this.properties = new Map();
      this.users = new Map();
      this.savedByUser = new Map(); // userId -> Set(propertyId)
      this.events = [];
      this._load();
    }

    _load(){
      try {
        const props = JSON.parse(localStorage.getItem(STORAGE_KEYS.properties) || '[]');
        props.forEach(p => this.properties.set(String(p.id), p));

        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
        users.forEach(u => this.users.set(String(u.id), u));

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.savedByUser) || '{}');
        Object.keys(saved).forEach(uid => {
          this.savedByUser.set(String(uid), new Set(saved[uid]));
        });

        const events = JSON.parse(localStorage.getItem(STORAGE_KEYS.events) || '[]');
        this.events = Array.isArray(events) ? events : [];
      } catch(e) {
        // fall back to empty
      }
    }

    _persist(){
      localStorage.setItem(STORAGE_KEYS.properties, JSON.stringify(Array.from(this.properties.values())));
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(Array.from(this.users.values())));
      const savedObj = {};
      for (const [uid, set] of this.savedByUser.entries()) {
        savedObj[uid] = Array.from(set.values());
      }
      localStorage.setItem(STORAGE_KEYS.savedByUser, JSON.stringify(savedObj));
      localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(this.events));
    }

    // Properties
    listProperties(filter = {}){
      let items = Array.from(this.properties.values());
      const { county, minPrice, maxPrice, bedrooms } = filter;
      if (county) {
        items = items.filter(p => (p.address && (p.address.county === county || p.address.region === county)));
      }
      if (minPrice != null) items = items.filter(p => parseInt(p.priceNumeric || 0, 10) >= minPrice);
      if (maxPrice != null) items = items.filter(p => parseInt(p.priceNumeric || 0, 10) <= maxPrice);
      if (bedrooms != null) items = items.filter(p => Number(p.bedrooms) >= bedrooms);
      return items;
    }

    upsertProperty(property){
      if (!property.id) property.id = Date.now();
      // derive numeric price if possible
      if (typeof property.price === 'string') {
        const digits = property.price.replace(/[^0-9]/g, '');
        property.priceNumeric = digits ? Number(digits) : 0;
      }
      this.properties.set(String(property.id), property);
      this._persist();
      return property;
    }

    // Saved
    savePropertyForUser(userId, propertyId){
      const key = String(userId);
      if (!this.savedByUser.has(key)) this.savedByUser.set(key, new Set());
      this.savedByUser.get(key).add(String(propertyId));
      this._persist();
      return true;
    }

    listSavedForUser(userId){
      const ids = Array.from((this.savedByUser.get(String(userId)) || new Set()).values());
      return ids.map(id => this.properties.get(id)).filter(Boolean);
    }

    // Users (minimal stubs; app uses existing Auth for auth)
    upsertUser(user){
      if (!user.id) user.id = Date.now();
      this.users.set(String(user.id), user);
      this._persist();
      return user;
    }

    // Events
    logEvent(evt){
      const event = { id: Date.now(), ts: new Date().toISOString(), ...evt };
      this.events.push(event);
      // keep last 1000
      if (this.events.length > 1000) this.events = this.events.slice(-1000);
      this._persist();
      return event;
    }
  }

  // Cloud providers stubs
  class CloudProvider {
    constructor(config){ this.config = config; }
    async listProperties(){ throw new Error('Not implemented'); }
    async upsertProperty(){ throw new Error('Not implemented'); }
    async savePropertyForUser(){ throw new Error('Not implemented'); }
    async listSavedForUser(){ throw new Error('Not implemented'); }
    async logEvent(){ throw new Error('Not implemented'); }
  }

  class SupabaseProvider extends CloudProvider {
    // Example wiring; requires supabase client and env keys
    constructor(config){ super(config); this.client = null; }
  }

  class FirebaseProvider extends CloudProvider {
    constructor(config){ super(config); this.app = null; }
  }

  class DataService {
    constructor(){
      this.local = new LocalRepository();
      this.cloud = null;
      this.ready = false;
    }

    init(config){
      // wire cloud provider if configured
      if (config && config.cloud && config.cloud.provider) {
        const p = config.cloud.provider.toLowerCase();
        if (p === 'supabase') this.cloud = new SupabaseProvider(config.cloud);
        if (p === 'firebase') this.cloud = new FirebaseProvider(config.cloud);
      }
      this.ready = true;
      return this;
    }

    // Prefer cloud if available, else local
    async getProperties(filter){
      if (this.cloud) {
        try {
          return await this.cloud.listProperties(filter);
        } catch(err){ /* fall back */ }
      }
      return this.local.listProperties(filter);
    }

    async addOrUpdateProperty(property){
      if (this.cloud) {
        try { return await this.cloud.upsertProperty(property); } catch(err){}
      }
      return this.local.upsertProperty(property);
    }

    async savePropertyForUser(userId, propertyId){
      if (this.cloud) {
        try { return await this.cloud.savePropertyForUser(userId, propertyId); } catch(err){}
      }
      return this.local.savePropertyForUser(userId, propertyId);
    }

    async listSavedForUser(userId){
      if (this.cloud) {
        try { return await this.cloud.listSavedForUser(userId); } catch(err){}
      }
      return this.local.listSavedForUser(userId);
    }

    async logEvent(evt){
      if (this.cloud) {
        try { return await this.cloud.logEvent(evt); } catch(err){}
      }
      return this.local.logEvent(evt);
    }
  }

  // seed minimal properties if none exist
  function seedIfEmpty(local){
    if (local.properties.size > 0) return;
    const sample = [
      { id: 1, title: 'Modern Studio, Westlands', price: 'KES 45,000', bedrooms: 0, bathrooms: 1, area: '40 sqm', address: { city: 'Nairobi', county: 'Nairobi' }, images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267'] },
      { id: 2, title: '2BR Apartment, Kilimani', price: 'KES 90,000', bedrooms: 2, bathrooms: 2, area: '85 sqm', address: { city: 'Nairobi', county: 'Nairobi' }, images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'] },
      { id: 3, title: '3BR House, Mombasa', price: 'KES 120,000', bedrooms: 3, bathrooms: 2, area: '140 sqm', address: { city: 'Mombasa', county: 'Mombasa' }, images: ['https://images.unsplash.com/photo-1568605114967-8130f3a36994'] }
    ];
    sample.forEach(p => local.upsertProperty(p));
  }

  // expose globally
  window.DataService = new DataService().init(window.APP_CONFIG || {});
  seedIfEmpty(window.DataService.local);
})();