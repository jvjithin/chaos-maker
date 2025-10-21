const configEl = document.getElementById('config-json');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');

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
  try {
    const config = JSON.parse(configEl.value);
    // Send message to background script to start
    chrome.runtime.sendMessage({ action: 'startChaos', config: config });
    
    // Update UI immediately
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    configEl.disabled = true;

  } catch (e) {
    alert('Invalid JSON configuration!');
  }
});

stopBtn.addEventListener('click', () => {
  // Send message to background script to stop
  chrome.runtime.sendMessage({ action: 'stopChaos' });

  // Update UI immediately
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  configEl.disabled = false;
});
