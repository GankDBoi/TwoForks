import { apiFetch } from '../app.js';

export async function renderBook(container, bookId) {
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
        <button onclick="window.location.hash='#dashboard'" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">←</button>
        <h2 id="book-title" style="margin: 0; flex-grow: 1;">Loading...</h2>
      </div>

      <div class="tabs" style="display: flex; gap: 20px; border-bottom: 2px solid var(--border); margin-bottom: 20px;">
        <div id="tab-restaurants" style="padding-bottom: 10px; font-weight: bold; cursor: pointer; border-bottom: 2px solid var(--accent); margin-bottom: -2px;">Restaurants</div>
        <div id="tab-decide" style="padding-bottom: 10px; font-weight: bold; cursor: pointer; color: var(--text-muted);">Decide</div>
      </div>

      <div id="content-area">
        <p>Loading...</p>
      </div>
    </div>
  `;

  // Fetch all books to find this one's title and mode
  try {
    const res = await apiFetch('/api/books');
    const books = await res.json();
    const book = books.find(b => b.id == bookId);
    
    if (book) {
      document.getElementById('book-title').textContent = book.name;
      // Set CSS variable to adjust the theme color based on mode
      const root = document.documentElement;
      if (book.mode === 'family') root.style.setProperty('--accent', 'var(--accent-family)');
      else if (book.mode === 'crew') root.style.setProperty('--accent', 'var(--accent-crew)');
      else root.style.setProperty('--accent', 'var(--accent-couple)');
    }
  } catch (err) {
    console.error(err);
  }

  const contentArea = document.getElementById('content-area');
  const tabRest = document.getElementById('tab-restaurants');
  const tabDecide = document.getElementById('tab-decide');

  const renderRestaurants = async () => {
    tabRest.style.color = 'var(--text)';
    tabRest.style.borderBottom = '2px solid var(--accent)';
    tabDecide.style.color = 'var(--text-muted)';
    tabDecide.style.borderBottom = 'none';

    contentArea.innerHTML = `
      <button id="btn-add-rest" style="width: 100%; padding: 15px; border-radius: 12px; background: transparent; border: 2px dashed var(--border); cursor: pointer; color: var(--text-muted); font-size: 1rem; margin-bottom: 20px;">+ Add Restaurant</button>
      <div id="restaurant-list">Loading restaurants...</div>
    `;

    document.getElementById('btn-add-rest').addEventListener('click', async () => {
      const name = prompt('Restaurant Name:');
      if (!name) return;
      const cuisine = prompt('Cuisine Type (e.g., Italian, Thai):') || '';
      
      try {
        const addRes = await apiFetch('/api/restaurants', {
          method: 'POST',
          body: JSON.stringify({ book_id: bookId, name, cuisine })
        });
        if (addRes.ok) {
          renderRestaurants();
        }
      } catch (err) {
        alert('Error adding restaurant');
      }
    });

    try {
      const restRes = await apiFetch(`/api/restaurants?book_id=${bookId}`);
      const restaurants = await restRes.json();
      const listDiv = document.getElementById('restaurant-list');

      if (restaurants.length === 0) {
        listDiv.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No restaurants yet.</p>';
      } else {
        listDiv.innerHTML = restaurants.map(r => `
          <div style="background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 15px; cursor: pointer; box-shadow: 0 2px 8px var(--shadow);" onclick="window.location.hash='#restaurant/${r.id}'">
            <h3 style="margin: 0 0 5px 0;">${escapeHTML(r.name)}</h3>
            <span style="font-size: 0.8rem; background: var(--bg); padding: 4px 10px; border-radius: 12px; color: var(--text-muted);">${escapeHTML(r.cuisine || 'Restaurant')}</span>
          </div>
        `).join('');
      }
    } catch (err) {
      document.getElementById('restaurant-list').innerHTML = 'Error loading restaurants';
    }
  };

  const renderDecide = async () => {
    tabDecide.style.color = 'var(--text)';
    tabDecide.style.borderBottom = '2px solid var(--accent)';
    tabRest.style.color = 'var(--text-muted)';
    tabRest.style.borderBottom = 'none';

    contentArea.innerHTML = `<div id="decide-list">Loading consensus dishes...</div>`;

    try {
      const decideRes = await apiFetch(`/api/decide?book_id=${bookId}`);
      const dishes = await decideRes.json();
      const listDiv = document.getElementById('decide-list');

      if (dishes.length === 0) {
        listDiv.innerHTML = `
          <div style="text-align: center; padding: 40px 20px;">
            <p style="font-size: 2rem; margin: 0;">🍽️</p>
            <p style="color: var(--text-muted);">No consensus dishes yet!</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">For a dish to appear here, everyone in the book must rate it 4+ stars and mark it "Order Again".</p>
          </div>
        `;
      } else {
        listDiv.innerHTML = `
          <div style="margin-bottom: 20px;">
            <button style="width: 100%; padding: 15px; border-radius: 12px; background: var(--accent); color: white; border: none; font-size: 1.1rem; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px var(--shadow);">
              Spin the Wheel (Pick for us)
            </button>
          </div>
        ` + dishes.map(d => `
          <div style="background: #fff; border: 1px solid var(--accent); border-radius: 12px; padding: 15px; margin-bottom: 15px; position: relative; overflow: hidden;">
            <div style="position: absolute; top: -15px; right: -15px; background: var(--accent); width: 50px; height: 50px; transform: rotate(45deg);"></div>
            <p style="position: absolute; top: 5px; right: 5px; margin:0; font-size: 0.8rem; color: white; font-weight: bold;">★</p>
            
            <h4 style="margin: 0 0 5px 0;">${escapeHTML(d.name)}</h4>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">@ ${escapeHTML(d.restaurant_name)}</p>
          </div>
        `).join('');
      }
    } catch (err) {
      document.getElementById('decide-list').innerHTML = 'Error loading decide tab';
    }
  };

  tabRest.addEventListener('click', renderRestaurants);
  tabDecide.addEventListener('click', renderDecide);

  // Initial render
  renderRestaurants();
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
