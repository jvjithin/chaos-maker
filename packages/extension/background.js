// --- State ---
let chaosTabId = null;
let hasNavigationBlock = false; // true when declarativeNetRequest blocks main_frame

// --- Message handling ---
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'startChaos') {
    startChaos(request.config).then((success) => sendResponse({ success }));
    return true; // keep channel open for async response
  } else if (request.action === 'stopChaos') {
    stopChaos().then(() => sendResponse({ success: true }));
    return true;
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- Scope wildcard patterns to the active tab's origin ---
// When presets use '*' (match all), replace with the tab's hostname so chaos
// only affects the page under test — not third-party analytics/tracking.
function scopeConfigToOrigin(config, origin) {
  if (!config.network || !origin) return config;
  const scoped = JSON.parse(JSON.stringify(config));
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return config;
  }
  const replaceWildcard = (items) => {
    if (!items) return;
    for (const item of items) {
      if (item.urlPattern === '*') {
        item.urlPattern = hostname;
      }
    }
  };
  replaceWildcard(scoped.network.cors);
  replaceWildcard(scoped.network.failures);
  replaceWildcard(scoped.network.latencies);
  replaceWildcard(scoped.network.aborts);
  replaceWildcard(scoped.network.corruptions);
  return scoped;
}

// --- declarativeNetRequest: network-level blocking ---
// Session rules support tabIds (dynamic rules do not).
// Used for CORS/offline chaos with probability 1.0 so that
// navigation, sub-resources, and all network traffic is blocked
// at the browser level — not just JS-initiated fetch/XHR.

const DNR_RULE_ID_START = 1000;

function buildBlockRules(config, tabId) {
  const rules = [];
  let ruleId = DNR_RULE_ID_START;

  if (!config.network?.cors) return rules;

  for (const cors of config.network.cors) {
    // Only create browser-level rules for deterministic blocking
    if (cors.probability !== 1.0) continue;

    rules.push({
      id: ruleId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: cors.urlPattern === '*' ? '*' : `*${cors.urlPattern}*`,
        tabIds: [tabId],
        resourceTypes: [
          'main_frame',
          'sub_frame',
          'stylesheet',
          'script',
          'image',
          'font',
          'object',
          'xmlhttprequest',
          'ping',
          'csp_report',
          'media',
          'websocket',
          'other',
        ],
      },
    });
  }

  return rules;
}

async function applyBlockRules(config, tabId) {
  const rules = buildBlockRules(config, tabId);
  if (rules.length === 0) return;

  // Track whether navigation itself is blocked (main_frame in resourceTypes)
  hasNavigationBlock = rules.some((r) =>
    r.condition.resourceTypes.includes('main_frame')
  );

  // Clear stale rules, then apply new ones
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const staleIds = existing.map((r) => r.id);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: staleIds,
    addRules: rules,
  });
  console.log(`Applied ${rules.length} network block rule(s) for tab ${tabId}`);
}

async function clearBlockRules() {
  hasNavigationBlock = false;
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const ids = existing.map((r) => r.id);
  if (ids.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
    console.log(`Cleared ${ids.length} network block rule(s)`);
  }
}

// --- JS-level chaos injection ---
async function injectChaos(tabId, config) {
  try {
    // 1. Place config in a global the library reads on load
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (c) => {
        window.__CHAOS_CONFIG__ = c;
      },
      args: [config],
      world: 'MAIN',
    });

    // 2. Inject the library — its auto-start reads __CHAOS_CONFIG__
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/chaos-maker.umd.js'],
      world: 'MAIN',
    });

    console.log(`ChaosMaker injected on tab ${tabId}`);
    return true;
  } catch (e) {
    console.error(`Failed to inject on tab ${tabId}:`, e.message);
    return false;
  }
}

async function removeChaos(tabId) {
  // Error pages (e.g. from declarativeNetRequest blocking navigation) reject
  // script injection. The JS cleanup is unnecessary there anyway.
  if (hasNavigationBlock) {
    console.log(`Tab ${tabId} showing error page — skipping JS cleanup`);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.chaosUtils) {
          window.chaosUtils.stop();
        }
      },
      world: 'MAIN', // must match the world where chaos was injected
    });
    console.log(`ChaosMaker stopped on tab ${tabId}`);
  } catch (e) {
    console.error(`Failed to stop on tab ${tabId}:`, e.message);
  }
}

// --- Start / Stop ---
async function startChaos(config) {
  const tab = await getActiveTab();
  if (!tab) return false;

  chaosTabId = tab.id;

  // Scope wildcard ('*') patterns to the active tab's origin so chaos
  // doesn't bleed into third-party analytics/tracking requests.
  const scopedConfig = scopeConfigToOrigin(config, tab.url);

  // Network-level blocking (offline / CORS with probability 1.0)
  await applyBlockRules(scopedConfig, tab.id);

  // JS-level chaos (fetch/XHR patching, DOM assaults)
  const success = await injectChaos(tab.id, scopedConfig);

  if (success) {
    chrome.storage.local.set({
      chaosActive: true,
      chaosConfig: scopedConfig,
      chaosTabId: tab.id,
    });
  } else {
    await clearBlockRules();
    chaosTabId = null;
  }

  return success;
}

async function stopChaos() {
  await clearBlockRules();

  // Stop JS chaos on the tracked tab — not just whichever tab is focused
  if (chaosTabId !== null) {
    await removeChaos(chaosTabId);
    chaosTabId = null;
  }

  chrome.storage.local.set({ chaosActive: false, chaosConfig: null, chaosTabId: null });
}

// --- Re-inject JS chaos on navigation (scoped to the chaos tab only) ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (tabId !== chaosTabId) return;
  // When declarativeNetRequest blocks navigation, Chrome shows an error page.
  // Attempting to inject into an error page always fails — skip it.
  if (hasNavigationBlock) return;

  chrome.storage.local.get(['chaosActive', 'chaosConfig'], (result) => {
    if (!result.chaosActive || !result.chaosConfig) return;
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;

    console.log(`Tab ${tabId} navigated. Re-injecting chaos.`);
    injectChaos(tabId, result.chaosConfig);
  });
});

// --- Clean up when the chaos tab is closed ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== chaosTabId) return;
  console.log(`Chaos tab ${tabId} closed. Cleaning up.`);
  clearBlockRules();
  chrome.storage.local.set({ chaosActive: false, chaosConfig: null, chaosTabId: null });
  chaosTabId = null;
});

// --- Restore in-memory state when service worker wakes ---
chrome.storage.local.get(['chaosActive', 'chaosTabId'], (result) => {
  if (result.chaosActive && result.chaosTabId) {
    chaosTabId = result.chaosTabId;
    // Verify the tab still exists
    chrome.tabs.get(chaosTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        clearBlockRules();
        chrome.storage.local.set({ chaosActive: false, chaosConfig: null, chaosTabId: null });
        chaosTabId = null;
      }
    });
  }
});
