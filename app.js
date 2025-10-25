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

// Modal wiring and auth buttons
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const loginModal = document.getElementById('login-modal');
  const signupModal = document.getElementById('signup-modal');

  function showModal(modal){ modal.style.display = 'flex'; }
  function hideModal(modal){ modal.style.display = 'none'; }

  // Open modals
  if (loginBtn) loginBtn.addEventListener('click', () => showModal(loginModal));
  if (signupBtn) signupBtn.addEventListener('click', () => showModal(signupModal));

  // Close modals via X
  document.querySelectorAll('.modal .close-modal').forEach(el => {
    el.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) hideModal(modal);
    });
  });

  // Switch between login and signup
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');
  if (showSignupLink) showSignupLink.addEventListener('click', (e) => { e.preventDefault(); hideModal(loginModal); showModal(signupModal); });
  if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); hideModal(signupModal); showModal(loginModal); });

  // User type toggle in login: show admin code when admin selected
  const loginUserTypeButtons = loginModal?.querySelectorAll('.user-type-toggle .user-type');
  const adminCodeContainer = loginModal?.querySelector('.admin-code-container');
  loginUserTypeButtons?.forEach(btn => {
    btn.addEventListener('click', () => {
      loginUserTypeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      if (adminCodeContainer) adminCodeContainer.style.display = (type === 'admin') ? 'block' : 'none';
    });
  });

  updateAuthButtons();
});

function updateAuthButtons(){
  const authButtons = document.querySelector('.auth-buttons');
  if (!authButtons) return;
  let logoutBtn = document.getElementById('logout-btn');
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');

  if (Auth.isLoggedIn()) {
    // Hide login/signup, show logout
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (!logoutBtn) {
      logoutBtn = document.createElement('button');
      logoutBtn.id = 'logout-btn';
      logoutBtn.className = 'logout-btn';
      logoutBtn.textContent = 'Logout';
      authButtons.appendChild(logoutBtn);
      logoutBtn.addEventListener('click', () => {
        Auth.logout();
        showNotification('You have been logged out', 'info');
        updateAuthButtons();
        // Optionally hide dashboard
        const dash = document.getElementById('dashboard-container');
        if (dash) dash.style.display = 'none';
      });
    }
    // Show dashboard for logged-in user
    const user = Auth.getCurrentUser();
    if (user) {
      try { createDashboard(user); } catch (e) { /* dashboard may not be ready yet */ }
      const dash = document.getElementById('dashboard-container');
      if (dash) dash.style.display = 'block';
    }
  } else {
    // Show login/signup, hide logout
    if (loginBtn) loginBtn.style.display = '';
    if (signupBtn) signupBtn.style.display = '';
    if (logoutBtn) { logoutBtn.remove(); }
  }
}