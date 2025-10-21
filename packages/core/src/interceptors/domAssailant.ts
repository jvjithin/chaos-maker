import { UiConfig, UiAssaultConfig } from '../config';

function shouldApplyChaos(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * Applies a specific chaos action to a given element.
 */
function applyAssault(element: HTMLElement, assault: UiAssaultConfig) {
  if (!shouldApplyChaos(assault.probability)) {
    return;
  }

  console.warn(`CHAOS: Applying action '${assault.action}' to element:`, element);
  
  try {
    switch (assault.action) {
      case 'disable':
        if ('disabled' in element) {
          (element as HTMLButtonElement | HTMLInputElement).disabled = true;
        }
        break;
      case 'hide':
        element.style.display = 'none';
        break;
      case 'remove':
        element.remove();
        break;
    }
  } catch (e) {
    console.error('Chaos Maker failed to assault element:', e, element);
  }
}

/**
 * Checks a given DOM node and its children against all UI assault rules.
 */
function checkNode(node: Node, config: UiConfig) {
  if (node.nodeType !== Node.ELEMENT_NODE || !config.assaults) {
    return;
  }

  const element = node as HTMLElement;

  for (const assault of config.assaults) {
    try {
      if (element.matches(assault.selector)) {
        applyAssault(element, assault);
      }
    } catch (e) {
      console.error(`Chaos Maker: Invalid selector '${assault.selector}'`, e);
    }

    element.querySelectorAll(assault.selector).forEach(childEl => {
      applyAssault(childEl as HTMLElement, assault);
    });
  }
}

/**
 * Creates and returns a MutationObserver that applies UI assaults
 * based on the provided configuration.
 */
export function attachDomAssailant(config: UiConfig): MutationObserver {
  
  // --- NEW LOGIC: Initial Scan ---
  // Run a one-time scan for elements that *already* exist on the page.
  if (config.assaults) {
    console.log('CHAOS: Running initial DOM scan for existing elements...');
    for (const assault of config.assaults) {
      try {
        // Find all elements on the page that match the selector
        document.querySelectorAll(assault.selector).forEach(element => {
          applyAssault(element as HTMLElement, assault);
        });
      } catch (e) {
        // Handle invalid selectors gracefully
        console.error(`Chaos Maker: Invalid selector in initial scan '${assault.selector}'`, e);
      }
    }
  }
  // --- END NEW LOGIC ---

  // Create the observer to watch for *future* changes
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => checkNode(node, config));
      }
    }
  });

  return observer;
}