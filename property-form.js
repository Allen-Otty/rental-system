// Property form functionality
class PropertyForm {
    constructor() {
        this.createPropertyFormModal();
        this.initializeEventListeners();
        this.multiImageUploader = new MultiImageUpload('property-images-upload', 5);
        this.imageUploader = this.multiImageUploader; // alias for enhancements compatibility
        this.mapsIntegration = new MapsIntegration();
    }

    createPropertyFormModal() {
        // Create modal container if it doesn't exist
        let propertyFormModal = document.getElementById('property-form-modal');
        
        if (!propertyFormModal) {
            propertyFormModal = document.createElement('div');
            propertyFormModal.id = 'property-form-modal';
            propertyFormModal.className = 'modal';
            
            const modalContent = document.createElement('div');
            modalContent.className = 'modal-content property-form-content';
            
            modalContent.innerHTML = `
                <span class="close-modal">&times;</span>
                <h2>Add New Property</h2>
                
                <form id="property-form">
                    <div class="form-group">
                        <label for="property-title">Property Title</label>
                        <input type="text" id="property-title" placeholder="e.g. Modern Studio Apartment" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="property-price">Monthly Rent</label>
                        <div class="price-input">
                            <span class="currency">$</span>
                            <input type="number" id="property-price" placeholder="e.g. 1200" required>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group half">
                            <label for="property-bedrooms">Bedrooms</label>
                            <input type="number" id="property-bedrooms" min="0" value="1" required>
                        </div>
                        
                        <div class="form-group half">
                            <label for="property-bathrooms">Bathrooms</label>
                            <input type="number" id="property-bathrooms" min="0" step="0.5" value="1" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="property-area">Area (sq ft)</label>
                        <input type="number" id="property-area" placeholder="e.g. 750" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="property-description">Description</label>
                        <textarea id="property-description" rows="4" placeholder="Describe your property..." required></textarea>
                    </div>
                    
                    <div class="form-group" id="property-images-upload-container">
                        <label>Property Images</label>
                        <div id="property-images-upload" class="image-upload-area"></div>
                        <p class="help-text">Upload up to 5 images. First image will be the main image.</p>
                    </div>
                    
                    <div class="form-group" id="property-location-container">
                        <label>Property Location</label>
                        <div id="property-location-map-container"></div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="cancel-property">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Property</button>
                    </div>
                </form>
            `;
            
            propertyFormModal.appendChild(modalContent);
            document.body.appendChild(propertyFormModal);
        }
    }

    initializeEventListeners() {
        // Close modal when clicking on X or outside the modal
        const modal = document.getElementById('property-form-modal');
        const closeBtn = modal.querySelector('.close-modal');
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Cancel button
        const cancelBtn = document.getElementById('cancel-property');
        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Form submission
        const form = document.getElementById('property-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProperty();
        });
    }

    showModal() {
        const modal = document.getElementById('property-form-modal');
        modal.style.display = 'flex';
        
        // Initialize map
        setTimeout(() => {
            this.mapsIntegration.initMap('property-location-map-container');
        }, 300);
    }

    saveProperty() {
        // Get form values
        const title = document.getElementById('property-title').value;
        const price = document.getElementById('property-price').value;
        const bedrooms = document.getElementById('property-bedrooms').value;
        const bathrooms = document.getElementById('property-bathrooms').value;
        const area = document.getElementById('property-area').value;
        const description = document.getElementById('property-description').value;
        
        // Get images from multi-image uploader
        const images = this.multiImageUploader.getImageUrls();
        
        // Get location from maps integration
        const location = this.mapsIntegration.getSelectedLocation() || 'Unknown location';
        
        // Create property object
        const property = {
            id: Date.now().toString(),
            title,
            price: `$${price}/month`,
            bedrooms: parseInt(bedrooms),
            bathrooms: parseFloat(bathrooms),
            area: `${area} sq ft`,
            description,
            images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8YXBhcnRtZW50fGVufDB8fDB8fHww&auto=format&fit=crop&w=500&q=60'],
            location,
            owner: Auth.getCurrentUser().name,
            saved: false,
            liked: false
        };
        
        // Add property to mock data
        mockProperties.push(property);
        
        // Show success message
        this.showNotification('Property added successfully!', 'success');
        
        // Close modal
        document.getElementById('property-form-modal').style.display = 'none';
        
        // Refresh landlord dashboard
        if (Auth.isLoggedIn()) {
            createDashboard(Auth.getCurrentUser());
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Hide and remove notification after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Function to show the add property modal
function showAddPropertyModal() {
    // Initialize property form if it doesn't exist
    if (!window.propertyForm) {
        window.propertyForm = new PropertyForm();
    }
    
    // Show the modal
    window.propertyForm.showModal();
}