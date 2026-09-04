export function renderDashboard(container) {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  container.innerHTML = `
    <div class="dashboard-container">
      <div class="header">
        <h2>Welcome, ${user ? user.display_name : 'Guest'}!</h2>
        <button class="logout-btn" onclick="window.logout()">Log out</button>
      </div>
      
      <p style="color: var(--text-muted);">Your books will appear here.</p>
      
      <!-- We will implement the Book list and Create Book logic next -->
    </div>
  `;
}
