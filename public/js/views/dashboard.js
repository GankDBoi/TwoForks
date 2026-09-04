import { apiFetch } from '../app.js';

export async function renderDashboard(container) {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  container.innerHTML = `
    <div class="dashboard-container">
      <div class="header">
        <h2>Welcome, ${user ? user.display_name.split(' ')[0] : 'Guest'}!</h2>
        <button class="logout-btn" onclick="window.logout()">Log out</button>
      </div>
      
      <div id="books-list">
        <p style="color: var(--text-muted);">Loading your books...</p>
      </div>

      <div class="action-buttons" style="margin-top: 30px; display: flex; gap: 10px;">
        <button id="btn-create-book" style="padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 20px; cursor: pointer;">+ New Book</button>
        <button id="btn-join-book" style="padding: 10px 20px; background: transparent; border: 1px solid var(--border); border-radius: 20px; cursor: pointer;">Join via Code</button>
      </div>
    </div>
  `;

  await loadBooks();

  document.getElementById('btn-create-book').addEventListener('click', async () => {
    const name = prompt('What do you want to call this book? (e.g., "Our Date Spots")');
    if (!name) return;
    
    // For free tier, we default to couple mode. 
    // Later we can build a full modal to select Family/Crew if they are on Table tier.
    try {
      const res = await apiFetch('/api/books', {
        method: 'POST',
        body: JSON.stringify({ name, mode: 'couple' })
      });
      if (res.ok) {
        await loadBooks();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create book');
      }
    } catch (err) {
      alert('Error creating book');
    }
  });

  document.getElementById('btn-join-book').addEventListener('click', async () => {
    const code = prompt('Enter the 6-character invite code:');
    if (!code) return;

    try {
      const res = await apiFetch('/api/books/join', {
        method: 'POST',
        body: JSON.stringify({ invite_code: code.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        await loadBooks();
      } else {
        alert(data.error || 'Failed to join book');
      }
    } catch (err) {
      alert('Error joining book');
    }
  });
}

async function loadBooks() {
  const listDiv = document.getElementById('books-list');
  try {
    const res = await apiFetch('/api/books');
    const books = await res.json();

    if (books.length === 0) {
      listDiv.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; background: #fff; border: 1px solid var(--border); border-radius: 12px;">
          <h3 style="margin-top:0;">You don't have any books yet.</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Create a new book to start saving restaurants, or join your partner's book with their invite code.</p>
        </div>
      `;
      return;
    }

    listDiv.innerHTML = books.map(book => {
      // Set accent color based on mode
      let badgeColor = 'var(--accent-couple)';
      if (book.mode === 'family') badgeColor = 'var(--accent-family)';
      if (book.mode === 'crew') badgeColor = 'var(--accent-crew)';

      return `
        <div class="book-card" onclick="window.location.hash='#book/${book.id}'" style="background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px var(--shadow);">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <h3 style="margin: 0;">${escapeHTML(book.name)}</h3>
              <span style="background: ${badgeColor}; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase;">${book.mode}</span>
            </div>
            <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">Invite Code: <strong style="color:var(--text); letter-spacing: 1px;">${book.invite_code}</strong></p>
          </div>
          <div style="color: var(--text-muted);">
            ➔
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    listDiv.innerHTML = '<p style="color: red;">Failed to load books. Please try refreshing.</p>';
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
