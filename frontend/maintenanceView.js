// Full-screen takeover shown when the backend reports maintenance mode (503,
// { status: 'maintenance' }). Deliberately independent of main.js's render()
// and app state - it needs to display correctly even if the app never
// finished bootstrapping (e.g. the very first request on page load 503s).
let shown = false;

// Read by main.js's render() so it stops overwriting #app once maintenance
// mode has taken over the screen - without this, any render() triggered by
// code after the failed request (e.g. loadSession()'s catch block) clobbers
// the maintenance screen with the normal login/dashboard markup a moment
// after it appears.
export function isMaintenanceActive() {
  return shown;
}

export function showMaintenanceView() {
  if (shown) return;
  shown = true;

  const root = document.querySelector('#app') || document.body;
  root.innerHTML = `
    <div class="maintenance-view">
      <div class="maintenance-view__card">
        <h1>Under maintenance</h1>
        <p>We are performing scheduled maintenance. We will be back shortly.</p>
        <button type="button" class="maintenance-view__retry">Try again</button>
      </div>
    </div>
  `;

  root.querySelector('.maintenance-view__retry')?.addEventListener('click', () => {
    window.location.reload();
  });
}
