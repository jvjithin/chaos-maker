// Listens for messages from the popup
chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  if (request.action === 'startChaos') {
    startChaos(request.config);
  } else if (request.action === 'stopChaos') {
    stopChaos();
  }
});

async function getActiveTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- HELPER FUNCTION ---
// This version uses the "auto-start" pattern.
async function injectChaos(tabId, config) {
  try {
    // 1. Inject the config object onto the page first.
    // We'll store it in a temporary global variable.
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (configToInject) => {
        window.__CHAOS_CONFIG__ = configToInject;
      },
      args: [config],
      world: 'MAIN',
    });

    // 2. Now inject the library.
    // Its new auto-start logic (from Step 1) will find
    // 'window.__CHAOS_CONFIG__' and start itself.
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['dist/chaos-maker.umd.js'],
      world: 'MAIN',
    });

    console.log(`ChaosMaker injected and started on tab ${tabId}`);
    return true; // Success

  } catch (e) {
    console.error(`Failed to inject script on tab ${tabId}:`, e.message);
    return false; // Failure
  }
}

// --- NEW HELPER FUNCTION ---
// Contains the core removal logic
async function removeChaos(tabId) {
  try {
    // Execute the global API 'stop' function
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        if (window.chaosUtils) {
          window.chaosUtils.stop();
        }
      },
    });
    console.log(`ChaosMaker stopped on tab ${tabId}`);
  } catch (e) {
    console.error(`Failed to remove script on tab ${tabId}:`, e.message);
  }
}

// --- UPDATED START/STOP FUNCTIONS ---
async function startChaos(config) {
  const tab = await getActiveTab();
  if (!tab) return;

  const success = await injectChaos(tab.id, config);
  
  if (success) {
    // Only set storage IF injection was successful
    chrome.storage.local.set({ chaosActive: true, config: config });
    // Update extension state
    // (This icon code is still commented out, which is fine)
    // chrome.action.setIcon({ path: 'icons/icon-active.png', tabId: tab.id });
  }
}

async function stopChaos() {
  // We want to stop chaos regardless of the current tab
  chrome.storage.local.set({ chaosActive: false });

  const tab = await getActiveTab();
  if (tab) {
    await removeChaos(tab.id);
    // Update extension state
    // chrome.action.setIcon({ path: 'icons/icon48.png', tabId: tab.id });
  }
}

// --- NEW: AUTO-INJECT ON NAVIGATION ---
// This is the key to persistence
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Wait for the navigation to complete
  if (changeInfo.status === 'complete' && tab.url) {
    
    // Check if chaos is supposed to be active
    chrome.storage.local.get(['chaosActive', 'config'], (result) => {
      if (result.chaosActive && result.config) {
        
        // Don't inject into non-web pages
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
          console.log(`Tab ${tabId} finished loading. Re-injecting chaos.`);
          // Re-run our injection logic on the new page
          injectChaos(tabId, result.config);
        }
      }
    });
  }
});
