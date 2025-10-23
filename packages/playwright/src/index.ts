import type { Page } from '@playwright/test';
import type { ChaosConfig } from '@chaos-maker/core';
import * as fs from 'fs';

// Read the UMD script content at build time
const scriptPath = require.resolve('@chaos-maker/core/dist/chaos-maker.umd.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

/**
 * Injects Chaos Maker into a Playwright page
 * @param page - The Playwright page instance
 * @param config - The chaos configuration to apply
 */
export async function injectChaos(page: Page, config: ChaosConfig): Promise<void> {
  await page.addInitScript((args) => {
    // Set the global config that the script will pick up
    (window as any).__CHAOS_CONFIG__ = args.config;
    // Execute the Chaos Maker script
    eval(args.scriptContent);
  }, { config, scriptContent });
}

/**
 * Alternative method that injects chaos after page load
 * Useful when you need to inject chaos after navigation
 * @param page - The Playwright page instance
 * @param config - The chaos configuration to apply
 */
export async function injectChaosAfterLoad(page: Page, config: ChaosConfig): Promise<void> {
  await page.evaluate((args) => {
    // Set the global config
    (window as any).__CHAOS_CONFIG__ = args.config;
    // Execute the Chaos Maker script
    eval(args.scriptContent);
  }, { config, scriptContent });
}
