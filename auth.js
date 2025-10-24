// Login form validation
function validateLoginForm(email, password, userType, adminCode = null) {
    const errors = [];
    
    // Email validation
    if (!email) {
        errors.push("Email is required");
    } else if (!isValidEmail(email)) {
        errors.push("Please enter a valid email address");
    }
    
    // Password validation
    if (!password) {
        errors.push("Password is required");
    }
    
    // Admin code validation if user type is admin
    if (userType === 'admin' && !adminCode) {
        errors.push("Admin security code is required");
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// Email format validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Display form errors
function displayFormErrors(errorContainer, errors) {
    errorContainer.innerHTML = '';
    
    if (errors.length > 0) {
        const errorList = document.createElement('ul');
        errorList.className = 'error-list';
        
        errors.forEach(error => {
            const errorItem = document.createElement('li');
            errorItem.textContent = error;
            errorList.appendChild(errorItem);
        });
        
        errorContainer.appendChild(errorList);
        errorContainer.style.display = 'block';
    } else {
        errorContainer.style.display = 'none';
    }
}

// Signup form validation
function validateSignupForm(name, email, password, confirmPassword, userType) {
    const errors = [];
    
    // Name validation
    if (!name || name.trim().length < 2) {
        errors.push("Full name must be at least 2 characters long");
    }
    
    // Email validation
    if (!email) {
        errors.push("Email is required");
    } else if (!isValidEmail(email)) {
        errors.push("Please enter a valid email address");
    }
    
    // Password validation
    if (!password) {
        errors.push("Password is required");
    } else if (!validatePasswordStrength(password)) {
        errors.push("Password must be at least 8 characters with uppercase, lowercase, number, and special character");
    }
    
    // Confirm password validation
    if (!confirmPassword) {
        errors.push("Please confirm your password");
    } else if (password !== confirmPassword) {
        errors.push("Passwords do not match");
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}