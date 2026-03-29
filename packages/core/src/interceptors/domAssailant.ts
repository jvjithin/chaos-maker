import { UiConfig, UiAssaultConfig } from '../config';
import { shouldApplyChaos } from '../utils';
import { ChaosEventEmitter } from '../events';

function applyAssault(element: HTMLElement, assault: UiAssaultConfig, emitter?: ChaosEventEmitter) {
  const applied = shouldApplyChaos(assault.probability);
  emitter?.emit({
    type: 'ui:assault',
    timestamp: Date.now(),
    applied,
    detail: { selector: assault.selector, action: assault.action },
  });

  if (!applied) {
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

function checkNode(node: Node, config: UiConfig, emitter?: ChaosEventEmitter) {
  if (node.nodeType !== Node.ELEMENT_NODE || !config.assaults) {
    return;
  }

  const element = node as HTMLElement;

  for (const assault of config.assaults) {
    try {
      if (element.matches(assault.selector)) {
        applyAssault(element, assault, emitter);
      }
    } catch (e) {
      console.error(`Chaos Maker: Invalid selector '${assault.selector}'`, e);
    }

    element.querySelectorAll(assault.selector).forEach(childEl => {
      applyAssault(childEl as HTMLElement, assault, emitter);
    });
  }
}

export function attachDomAssailant(config: UiConfig, emitter?: ChaosEventEmitter): MutationObserver {
  if (config.assaults) {
    console.log('CHAOS: Running initial DOM scan for existing elements...');
    for (const assault of config.assaults) {
      try {
        document.querySelectorAll(assault.selector).forEach(element => {
          applyAssault(element as HTMLElement, assault, emitter);
        });
      } catch (e) {
        console.error(`Chaos Maker: Invalid selector in initial scan '${assault.selector}'`, e);
      }
    }
  }

  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => checkNode(node, config, emitter));
      }
    }
  });

  return observer;
}
