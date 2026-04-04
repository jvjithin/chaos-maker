const configEl = document.getElementById('config-json');
const presetSelect = document.getElementById('preset-select');
const presetPreview = document.getElementById('preset-preview');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const errorEl = document.getElementById('error-message');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');

// Presets must match packages/core/src/presets.ts
const presets = {
  unstableApi: {
    network: {
      failures: [{ urlPattern: '/api/', statusCode: 500, probability: 0.1 }],
      latencies: [{ urlPattern: '/api/', delayMs: 1000, probability: 0.2 }],
    },
  },
  slowNetwork: {
    network: {
      latencies: [{ urlPattern: '/', delayMs: 2000, probability: 1.0 }],
    },
  },
  offlineMode: {
    network: {
      cors: [{ urlPattern: '/', probability: 1.0 }],
    },
  },
  flakyConnection: {
    network: {
      aborts: [{ urlPattern: '/', probability: 0.05 }],
      latencies: [{ urlPattern: '/', delayMs: 3000, probability: 0.1 }],
    },
  },
  degradedUi: {
    ui: {
      assaults: [
        { selector: 'button', action: 'disable', probability: 0.2 },
        { selector: 'a', action: 'hide', probability: 0.1 },
      ],
    },
  },
};

// --- Tab switching ---
function activateTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  document.getElementById(`${tab.dataset.tab}-panel`).classList.add('active');
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab));
});

// --- Preset preview ---
function updatePresetPreview() {
  const selected = presetSelect.value;
  presetPreview.textContent = JSON.stringify(presets[selected], null, 2);
}

presetSelect.addEventListener('change', updatePresetPreview);
updatePresetPreview();

// --- Error display ---
function setError(message) {
  errorEl.textContent = message;
  if (message) {
    errorEl.classList.remove('hidden');
  } else {
    errorEl.classList.add('hidden');
  }
}

// --- Status display ---
function setActive(active) {
  if (active) {
    statusEl.className = 'status status-active';
    statusText.textContent = 'Active';
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    configEl.disabled = true;
    presetSelect.disabled = true;
  } else {
    statusEl.className = 'status status-inactive';
    statusText.textContent = 'Inactive';
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    configEl.disabled = false;
    presetSelect.disabled = false;
  }
}

// --- Get config from active tab ---
function getActiveConfig() {
  const activeTabEl = document.querySelector('.tab.active');
  const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'presets';
  if (activeTab === 'presets') {
    return presets[presetSelect.value];
  }
  return JSON.parse(configEl.value);
}

// --- Load saved state ---
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['chaosActive', 'config', 'mode', 'preset'], (result) => {
    if (result.mode === 'custom' && result.config) {
      configEl.value = JSON.stringify(result.config, null, 2);
      activateTab(document.querySelector('[data-tab="custom"]'));
    }
    if (result.preset && presets[result.preset]) {
      presetSelect.value = result.preset;
      updatePresetPreview();
    }
    setActive(!!result.chaosActive);
  });
});

// --- Start ---
startBtn.addEventListener('click', () => {
  setError('');
  try {
    const config = getActiveConfig();
    const activeTabEl = document.querySelector('.tab.active');
    const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'presets';
    chrome.runtime.sendMessage({ action: 'startChaos', config });
    chrome.storage.local.set({
      chaosActive: true,
      mode: activeTab,
      preset: activeTab === 'presets' ? presetSelect.value : null,
      config: activeTab === 'custom' ? config : null,
    });
    setActive(true);
  } catch {
    setError('Invalid JSON configuration. Check your syntax.');
  }
});

// --- Stop ---
stopBtn.addEventListener('click', () => {
  setError('');
  chrome.runtime.sendMessage({ action: 'stopChaos' });
  chrome.storage.local.set({ chaosActive: false });
  setActive(false);
});
