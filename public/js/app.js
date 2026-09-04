import { renderLanding } from './views/landing.js';
import { renderDashboard } from './views/dashboard.js';
import { renderBook } from './views/book.js';

const appDiv = document.getElementById('app');

// Google Auth Callback (must be attached to window so Google's script can call it)
window.handleCredentialResponse = async (response) => {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.hash = '#dashboard';
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (err) {
    console.error(err);
    alert('Server error during login');
  }
};

window.logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.hash = '#';
};

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(endpoint, { ...options, headers });
  if (res.status === 401) {
    window.logout();
    throw new Error('Unauthorized');
  }
  return res;
}

// Router
function route() {
  const hash = window.location.hash || '#';
  const token = localStorage.getItem('token');
  
  // Protect routes
  if (!token && hash !== '#') {
    window.location.hash = '#';
    return;
  }

  // Redirect to dashboard if logged in and on landing
  if (token && hash === '#') {
    window.location.hash = '#dashboard';
    return;
  }

  // Clear current view
  appDiv.innerHTML = '';

  if (hash === '#') {
    renderLanding(appDiv);
  } else if (hash === '#dashboard') {
    renderDashboard(appDiv);
  } else if (hash.startsWith('#book/')) {
    const bookId = hash.split('/')[1];
    renderBook(appDiv, bookId);
  } else {
    renderLanding(appDiv);
  }
}

window.addEventListener('hashchange', route);

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
  route();
});
