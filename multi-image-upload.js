(function(){
  class MultiImageUpload {
    constructor(containerId, options = {}) {
      // Allow numeric second arg for max files
      if (typeof options === 'number') options = { maxFiles: options };
      this.options = Object.assign({ maxFiles: 5 }, options);
      this.images = [];

      // Resolve container and area
      this.container = document.getElementById(containerId) || document.body;
      let area = this.container.querySelector('.image-upload-area');
      if (!area && this.container.id !== containerId) {
        area = document.createElement('div');
        area.className = 'image-upload-area';
        this.container.appendChild(area);
      } else if (!area) {
        area = this.container;
      }
      this.area = area;

      // Build file input if missing
      let input = this.container.querySelector('input[type="file"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.style.display = 'block';
        input.style.marginBottom = '8px';
        this.container.appendChild(input);
      }
      this.input = input;

      // Build preview grid
      let preview = this.container.querySelector('.image-preview');
      if (!preview) {
        preview = document.createElement('div');
        preview.className = 'image-preview';
        preview.style.display = 'grid';
        preview.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
        preview.style.gap = '8px';
        this.container.appendChild(preview);
      }
      this.preview = preview;

      input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files.slice(0, Math.max(0, this.options.maxFiles - this.images.length))){
          const url = await this._fileToUrl(file);
          if (url) {
            this.images.push(url);
            this._addThumb(url);
          }
        }
      });
    }

    async _fileToUrl(file){
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    }

    _addThumb(url){
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'uploaded image';
      img.style.width = '100%';
      img.style.height = '80px';
      img.style.objectFit = 'cover';
      this.preview.appendChild(img);
    }

    // Primary API expected by property-form.js
    getImageUrls(){
      return this.images.slice();
    }

    // Compatibility with modules expecting getImages()
    getImages(){
      return this.getImageUrls();
    }
  }

  if (!window.MultiImageUpload) {
    window.MultiImageUpload = MultiImageUpload;
  }
})();