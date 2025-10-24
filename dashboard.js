// Admin dashboard helper functions
function showAddAdminModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'add-admin-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Add New Admin User</h2>
            <form id="add-admin-form">
                <div class="form-group">
                    <label for="admin-name">Full Name</label>
                    <input type="text" id="admin-name" required>
                </div>
                <div class="form-group">
                    <label for="admin-email">Email</label>
                    <input type="email" id="admin-email" required>
                </div>
                <div class="form-group">
                    <label for="admin-password">Initial Password</label>
                    <input type="password" id="admin-password" required>
                    <div class="password-strength-meter">
                        <div class="strength-bar"></div>
                    </div>
                    <p class="password-requirements">
                        Password must be at least 8 characters with uppercase, lowercase, number, and special character
                    </p>
                </div>
                <div class="form-group">
                    <label for="admin-role">Admin Role</label>
                    <select id="admin-role" required>
                        <option value="super-admin">Super Admin</option>
                        <option value="property-admin">Property Admin</option>
                        <option value="user-admin">User Admin</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="admin-code">Your Admin Security Code</label>
                    <input type="password" id="admin-code" required>
                </div>
                <button type="submit" class="btn primary">Create Admin User</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal functionality
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Form submission
    document.getElementById('add-admin-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Validate admin code
        const adminCode = document.getElementById('admin-code').value;
        if (!Auth.validateAdminCode(adminCode)) {
            showNotification('Invalid admin security code. Access denied.', 'error');
            return;
        }
        
        // Validate password strength
        const password = document.getElementById('admin-password').value;
        if (!Auth.validatePasswordStrength(password)) {
            showNotification('Password does not meet security requirements', 'error');
            return;
        }
        
        // In a real app, this would securely create a new admin user
        showNotification('New admin user created successfully', 'success');
        document.body.removeChild(modal);
    });
    
    // Password strength meter
    const passwordInput = document.getElementById('admin-password');
    const strengthBar = document.querySelector('.strength-bar');
    
    passwordInput.addEventListener('input', () => {
        const password = passwordInput.value;
        let strength = 0;
        
        if (password.length >= 8) strength += 20;
        if (password.match(/[A-Z]/)) strength += 20;
        if (password.match(/[a-z]/)) strength += 20;
        if (password.match(/[0-9]/)) strength += 20;
        if (password.match(/[^A-Za-z0-9]/)) strength += 20;
        
        strengthBar.style.width = strength + '%';
        
        if (strength < 40) {
            strengthBar.style.backgroundColor = '#ff4d4d';
        } else if (strength < 80) {
            strengthBar.style.backgroundColor = '#ffd633';
        } else {
            strengthBar.style.backgroundColor = '#47d147';
        }
    });
}

function showSecurityLogs() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'security-logs-modal';
    
    modal.innerHTML = `
        <div class="modal-content wide-modal">
            <span class="close">&times;</span>
            <h2>Security Logs</h2>
            <div class="filter-controls">
                <select id="log-type-filter">
                    <option value="all">All Events</option>
                    <option value="login">Login Events</option>
                    <option value="admin">Admin Actions</option>
                    <option value="security">Security Alerts</option>
                </select>
                <input type="date" id="log-date-filter">
                <button id="export-logs" class="btn">Export Logs</button>
            </div>
            <div class="logs-container">
                <table class="logs-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>User</th>
                            <th>Event Type</th>
                            <th>IP Address</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="log-entry login-event">
                            <td>2023-06-15 08:45:22</td>
                            <td>admin@example.com</td>
                            <td>Login Success</td>
                            <td>192.168.1.105</td>
                            <td>Admin portal access</td>
                        </tr>
                        <tr class="log-entry security-alert">
                            <td>2023-06-15 07:30:15</td>
                            <td>unknown</td>
                            <td>Failed Login Attempt</td>
                            <td>45.123.45.67</td>
                            <td>5 consecutive failed attempts</td>
                        </tr>
                        <tr class="log-entry admin-action">
                            <td>2023-06-14 16:22:45</td>
                            <td>admin@example.com</td>
                            <td>User Modified</td>
                            <td>192.168.1.105</td>
                            <td>Changed role for user ID #15</td>
                        </tr>
                        <tr class="log-entry admin-action">
                            <td>2023-06-14 15:17:32</td>
                            <td>admin@example.com</td>
                            <td>Property Verified</td>
                            <td>192.168.1.105</td>
                            <td>Verified property ID #28</td>
                        </tr>
                        <tr class="log-entry security-alert">
                            <td>2023-06-13 22:45:10</td>
                            <td>system</td>
                            <td>Unusual Activity</td>
                            <td>78.45.123.210</td>
                            <td>Multiple property deletion attempts</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal functionality
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Filter functionality
    document.getElementById('log-type-filter').addEventListener('change', filterLogs);
    document.getElementById('log-date-filter').addEventListener('change', filterLogs);
    
    function filterLogs() {
        const typeFilter = document.getElementById('log-type-filter').value;
        const dateFilter = document.getElementById('log-date-filter').value;
        
        const logEntries = document.querySelectorAll('.log-entry');
        
        logEntries.forEach(entry => {
            let showByType = typeFilter === 'all' || entry.classList.contains(typeFilter + '-event');
            let showByDate = true; // In a real app, we would filter by date here
            
            entry.style.display = (showByType && showByDate) ? '' : 'none';
        });
    }
    
    // Export logs functionality
    document.getElementById('export-logs').addEventListener('click', () => {
        showNotification('Security logs exported to CSV file', 'success');
    });
}

function showChangeAdminCodeModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'change-admin-code-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Change Admin Security Code</h2>
            <form id="change-admin-code-form">
                <div class="form-group">
                    <label for="current-admin-code">Current Admin Code</label>
                    <input type="password" id="current-admin-code" required>
                </div>
                <div class="form-group">
                    <label for="new-admin-code">New Admin Code</label>
                    <input type="password" id="new-admin-code" required>
                </div>
                <div class="form-group">
                    <label for="confirm-admin-code">Confirm New Admin Code</label>
                    <input type="password" id="confirm-admin-code" required>
                </div>
                <button type="submit" class="btn primary">Update Admin Code</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal functionality
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Form submission
    document.getElementById('change-admin-code-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const currentCode = document.getElementById('current-admin-code').value;
        const newCode = document.getElementById('new-admin-code').value;
        const confirmCode = document.getElementById('confirm-admin-code').value;
        
        // Validate current admin code
        if (!Auth.validateAdminCode(currentCode)) {
            showNotification('Current admin code is incorrect', 'error');
            return;
        }
        
        // Validate new code
        if (newCode.length < 8) {
            showNotification('New admin code must be at least 8 characters', 'error');
            return;
        }
        
        // Confirm codes match
        if (newCode !== confirmCode) {
            showNotification('New admin codes do not match', 'error');
            return;
        }
        
        // In a real app, this would update the admin code securely
        showNotification('Admin security code updated successfully', 'success');
        document.body.removeChild(modal);
    });
}

function handleAdminTableAction(event) {
    const button = event.target;
    const action = button.classList[1]; // edit, delete, lock, view, flag, verify
    const row = button.closest('tr');
    const id = row.cells[0].textContent;
    const name = row.cells[1].textContent;
    
    switch (action) {
        case 'edit':
            showNotification(`Editing ${name} (ID: ${id})`, 'info');
            break;
        case 'delete':
            if (confirm(`Are you sure you want to delete ${name} (ID: ${id})?`)) {
                showNotification(`${name} (ID: ${id}) has been deleted`, 'success');
                row.remove();
            }
            break;
        case 'lock':
            showNotification(`Account for ${name} (ID: ${id}) has been locked`, 'success');
            button.textContent = 'Unlock';
            button.classList.replace('lock', 'unlock');
            break;
        case 'unlock':
            showNotification(`Account for ${name} (ID: ${id}) has been unlocked`, 'success');
            button.textContent = 'Lock';
            button.classList.replace('unlock', 'lock');
            break;
        case 'view':
            showNotification(`Viewing details for property ID: ${id}`, 'info');
            break;
        case 'flag':
            showNotification(`Property ID: ${id} has been flagged for review`, 'success');
            break;
        case 'verify':
            showNotification(`Property ID: ${id} has been verified`, 'success');
            const verificationCell = row.cells[5];
            verificationCell.innerHTML = '<span class="verification verified">Verified</span>';
            button.textContent = 'Flag';
            button.classList.replace('verify', 'flag');
            break;
    }
}