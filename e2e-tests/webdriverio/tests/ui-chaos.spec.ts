import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

describe('UI Assaults', () => {
  it('disables targeted buttons', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: { assaults: [{ selector: '#submit-btn', action: 'disable', probability: 1.0 }] },
    });
    await expect($('#submit-btn')).toBeDisabled();
    await expect($('#action-btn')).toBeEnabled();
  });

  it('hides targeted elements', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: { assaults: [{ selector: '#nav-link', action: 'hide', probability: 1.0 }] },
    });
    await expect($('#nav-link')).not.toBeDisplayed();
    await expect($('#submit-btn')).toBeDisplayed();
  });

  it('removes targeted elements from DOM', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: { assaults: [{ selector: '#removable-div', action: 'remove', probability: 1.0 }] },
    });
    await expect($('#removable-div')).not.toBeExisting();
  });

  it('assaults dynamically added elements via MutationObserver', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: { assaults: [{ selector: '.dynamic-btn', action: 'disable', probability: 1.0 }] },
    });
    await expect($('.dynamic-btn')).not.toBeExisting();
    await $('#add-dynamic').click();
    await expect($('.dynamic-btn')).toBeExisting();
    await expect($('.dynamic-btn')).toBeDisabled();
  });

  it('skips assault when probability is 0', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: { assaults: [{ selector: '#submit-btn', action: 'disable', probability: 0 }] },
    });
    await expect($('#submit-btn')).toBeEnabled();
  });

  it('applies multiple assaults simultaneously', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: {
        assaults: [
          { selector: '#submit-btn', action: 'disable', probability: 1.0 },
          { selector: '#nav-link', action: 'hide', probability: 1.0 },
          { selector: '#removable-div', action: 'remove', probability: 1.0 },
        ],
      },
    });
    await expect($('#submit-btn')).toBeDisabled();
    await expect($('#nav-link')).not.toBeDisplayed();
    await expect($('#removable-div')).not.toBeExisting();
  });

  it('logs UI assault events', async () => {
    await browser.url('/');
    await browser.injectChaos({
      ui: { assaults: [{ selector: 'button', action: 'disable', probability: 1.0 }] },
    });
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const uiEvents = log.filter((e) => e.type === 'ui:assault');
    expect(uiEvents.length).toBeGreaterThan(0);
    expect(uiEvents.some((e) => e.applied)).toBe(true);
  });
});
