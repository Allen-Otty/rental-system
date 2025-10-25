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

// Simple local Auth implementation
(function(){
  const USERS_KEY = 'rs_users';
  const CURRENT_USER_KEY = 'rs_current_user';
  const ADMIN_CODE_KEY = 'rs_admin_code';
  const DEFAULT_ADMIN_CODE = 'ADMIN1234';

  function loadUsers(){
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch { return []; }
  }
  function saveUsers(users){ localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
  function setCurrentUser(user){ localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user)); }
  function getCurrentUser(){ try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY)) || null; } catch { return null; } }

  // Password strength validation (global helper used by forms)
  function validatePasswordStrength(password) {
    if (window.Auth && typeof window.Auth.validatePasswordStrength === 'function') {
      return window.Auth.validatePasswordStrength(password);
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return password && password.length >= 8 && hasUpper && hasLower && hasNumber && hasSpecial;
  }

  function validateAdminCode(code){
    const saved = localStorage.getItem(ADMIN_CODE_KEY) || DEFAULT_ADMIN_CODE;
    return String(code || '').trim() === String(saved).trim();
  }

  window.Auth = {
    async register(name, email, password, confirmPassword, userType){
      const users = loadUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return Promise.reject('An account with this email already exists');
      }
      if (!validatePasswordStrength(password)) {
        return Promise.reject('Password does not meet security requirements');
      }
      if (password !== confirmPassword) {
        return Promise.reject('Passwords do not match');
      }
      const user = {
        id: Date.now().toString(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: userType || 'tenant',
        created_at: new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
      setCurrentUser({ id: user.id, name: user.name, email: user.email, role: user.role });
      return Promise.resolve({ id: user.id, name: user.name, email: user.email, role: user.role });
    },

    async login(email, password, adminCode){
      const users = loadUsers();
      const user = users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
      if (!user) return Promise.reject('No account found with this email');
      if (user.password !== password) return Promise.reject('Incorrect password');
      if (user.role === 'admin' && !validateAdminCode(adminCode)) {
        return Promise.reject('Admin security code is invalid');
      }
      setCurrentUser({ id: user.id, name: user.name, email: user.email, role: user.role });
      return Promise.resolve({ id: user.id, name: user.name, email: user.email, role: user.role });
    },

    logout(){ localStorage.removeItem(CURRENT_USER_KEY); },
    isLoggedIn(){ return !!getCurrentUser(); },
    getCurrentUser,
    validatePasswordStrength,
    validateAdminCode,
    setAdminCode(code){ if (code && String(code).trim().length >= 4) localStorage.setItem(ADMIN_CODE_KEY, String(code).trim()); }
  };
})();