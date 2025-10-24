// Event listeners for login form
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const userType = document.querySelector('.user-type-toggle .active').dataset.type;
    const adminCode = document.getElementById('admin-code').value;
    const errorContainer = document.getElementById('login-error');
    
    // Validate form inputs
    const validation = validateLoginForm(email, password, userType, adminCode);
    
    if (!validation.isValid) {
        displayFormErrors(errorContainer, validation.errors);
        return;
    }
    
    // Clear previous errors
    errorContainer.style.display = 'none';
    
    // Show loading state
    const submitButton = this.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Logging in...';
    submitButton.disabled = true;
    
    // Attempt login
    Auth.login(email, password, adminCode)
        .then(user => {
            // Hide login modal
            document.getElementById('login-modal').style.display = 'none';
            
            // Create dashboard for user
            createDashboard(user);
            
            // Show success notification
            showNotification(`Welcome back, ${user.name}!`, 'success');
            
            // Update auth buttons
            updateAuthButtons();
        })
        .catch(error => {
            // Display error
            displayFormErrors(errorContainer, [error]);
        })
        .finally(() => {
            // Reset button state
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        });
});

// Event listeners for signup form
document.getElementById('signup-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const userType = document.querySelector('#signup-modal .user-type.active').dataset.type || 'tenant';
    const errorContainer = document.getElementById('signup-error');
    
    // Validate form inputs
    const validation = validateSignupForm(name, email, password, confirmPassword, userType);
    
    if (!validation.isValid) {
        displayFormErrors(errorContainer, validation.errors);
        return;
    }
    
    // Clear previous errors
    errorContainer.style.display = 'none';
    
    // Show loading state
    const submitButton = this.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Signing up...';
    submitButton.disabled = true;
    
    // Attempt registration
    Auth.register(name, email, password, confirmPassword, userType)
        .then(user => {
            // Hide signup modal
            document.getElementById('signup-modal').style.display = 'none';
            
            // Create dashboard for user
            createDashboard(user);
            
            // Show success notification
            showNotification(`Welcome, ${user.name}! Your account has been created.`, 'success');
            
            // Update auth buttons
            updateAuthButtons();
        })
        .catch(error => {
            // Display error
            displayFormErrors(errorContainer, [error]);
        })
        .finally(() => {
            // Reset button state
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        });
});