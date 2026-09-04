export function renderLanding(container) {
  // Using the Client ID you provided
  const clientId = '690546514286-6dvor6njun7673q68ssghdif2oarp5ca.apps.googleusercontent.com';

  container.innerHTML = `
    <div class="landing-container">
      <h1>Two Forks</h1>
      <p>A shared book of the dishes you and your person actually loved, restaurant by restaurant.</p>
      
      <div id="google-btn-wrapper"></div>
      
      <p style="font-size: 0.8rem; color: #8a8a8a; margin-top: 20px;">
        Make sure you are a "Test User" in Google Cloud, or you will get an Access Blocked error!
      </p>
    </div>
  `;

  // Wait for Google Identity Services script to load
  const checkGoogle = setInterval(() => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      clearInterval(checkGoogle);
      
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: window.handleCredentialResponse
      });
      
      window.google.accounts.id.renderButton(
        document.getElementById("google-btn-wrapper"),
        { theme: "outline", size: "large", shape: "pill", width: 250 }
      );
    }
  }, 100);
}
