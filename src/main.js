const { invoke } = window.__TAURI__.core;

let dumpContainer;

async function loadDumps() {
  try {
    const dumps = await invoke("get_dumps");
    displayDumps(dumps);
  } catch (error) {
    console.error("Failed to load dumps:", error);
  }
}

async function clearDumps() {
  try {
    await invoke("clear_dumps");
    displayDumps([]);
  } catch (error) {
    console.error("Failed to clear dumps:", error);
  }
}

function displayDumps(dumps) {
  if (!dumps || dumps.length === 0) {
    dumpContainer.innerHTML = '<p id="no-dumps" class="no-dumps">No dumps available</p>';
    return;
  }

  const dumpsHtml = dumps
    .map((dump, index) => `
      <details class="dump-item" ${index === 0 ? 'open' : ''}>
        <summary class="dump-summary">
          <span class="dump-timestamp">${new Date(dump.timestamp).toLocaleString()}</span>
          ${dump.file ? `<span class="dump-file">${dump.file}${dump.line ? `:${dump.line}` : ''}</span>` : ''}
        </summary>
        <pre class="dump-output">${escapeHtml(dump.output)}</pre>
      </details>
    `).join('');

  dumpContainer.innerHTML = dumpsHtml;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-refresh dumps every 2 seconds
let autoRefreshInterval;

function startAutoRefresh() {
  autoRefreshInterval = setInterval(loadDumps, 2000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  dumpContainer = document.querySelector("#dump-container");

  document
    .querySelector("#refresh-dumps")
    .addEventListener("click", loadDumps);
  document
    .querySelector("#clear-dumps")
    .addEventListener("click", clearDumps);

  loadDumps();
  startAutoRefresh();
});

// Clean up interval when page unloads
window.addEventListener("beforeunload", stopAutoRefresh);
