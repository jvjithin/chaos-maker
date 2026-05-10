/// <reference types="cypress" />
import type { ChaosEvent } from '@chaos-maker/core';
import { formatStepTitle, shouldEmitStep } from '@chaos-maker/core';

interface ChaosEventSource {
  on(type: '*', listener: (event: ChaosEvent) => void): void;
}

interface ChaosUtilsWithLogBinding {
  instance?: ChaosEventSource | null;
  __chaosMakerCypressLogBound?: ChaosEventSource | null;
}

function getChaosUtils(win: Cypress.AUTWindow): ChaosUtilsWithLogBinding | undefined {
  return (win as unknown as { chaosUtils?: ChaosUtilsWithLogBinding }).chaosUtils;
}

export function bindCypressCommandLog(win: Cypress.AUTWindow): void {
  if (typeof Cypress.log !== 'function') return;

  const attach = (): boolean => {
    const utils = getChaosUtils(win);
    const instance = utils?.instance;
    if (!utils || !instance || typeof instance.on !== 'function') return false;
    if (utils.__chaosMakerCypressLogBound === instance) return true;

    utils.__chaosMakerCypressLogBound = instance;
    instance.on('*', (event: ChaosEvent) => {
      if (!shouldEmitStep(event, false)) return;
      Cypress.log({
        name: 'chaos',
        message: formatStepTitle(event),
        consoleProps: () => event,
      });
    });
    return true;
  };

  if (attach()) return;

  const intervalId = win.setInterval(() => {
    if (attach()) win.clearInterval(intervalId);
  }, 10);
  win.setTimeout(() => win.clearInterval(intervalId), 5000);
}
