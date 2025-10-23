const configEl = document.getElementById('config-json');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const errorEl = document.getElementById('error-message');

const defaultConfig = {
  "network": {
    "failures": [
      { "urlPattern": "/api/", "statusCode": 503, "probability": 0.5 }
    ],
    "latencies": [
      { "urlPattern": "/api/", "delayMs": 2000, "probability": 0.5 }
    ]
  }
};

// Function to show/hide error messages
function setErrorMessage(message) {
  errorEl.textContent = message;
  if (message) {
    errorEl.classList.remove('hidden');
    configEl.style.borderColor = '#f44336';
  } else {
    errorEl.classList.add('hidden');
    configEl.style.borderColor = '';
  }
}

// Load saved state on popup open
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['chaosActive', 'config'], (result) => {
    if (result.config) {
      configEl.value = JSON.stringify(result.config, null, 2);
    } else {
      configEl.value = JSON.stringify(defaultConfig, null, 2);
    }
    
    if (result.chaosActive) {
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      configEl.disabled = true;
    } else {
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      configEl.disabled = false;
    }
  });
});

startBtn.addEventListener('click', () => {
  setErrorMessage('');
  try {
    const config = JSON.parse(configEl.value);
    chrome.runtime.sendMessage({ action: 'startChaos', config: config });
    
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    configEl.disabled = true;

  } catch {
    setErrorMessage('Invalid JSON configuration!');
  }
});

stopBtn.addEventListener('click', () => {
  setErrorMessage('');
  chrome.runtime.sendMessage({ action: 'stopChaos' });

  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  configEl.disabled = false;
});
