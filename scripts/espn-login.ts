/**
 * ESPN Login Session Capture Script
 * 
 * This script opens a Chromium browser window for you to log into ESPN.
 * Once you're logged in, it saves the session state to .playwright/espn-storage.json
 * which can be reused for authenticated scraping.
 * 
 * Usage: npx tsx scripts/espn-login.ts
 */

import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const STORAGE_PATH = path.join(process.cwd(), '.playwright', 'espn-storage.json');

async function captureESPNLogin() {
  console.log('\n=== ESPN Login Session Capture ===\n');
  console.log('This will open a browser window for you to log into ESPN.');
  console.log('Once logged in, close the browser window to save the session.\n');

  // Ensure .playwright directory exists
  const dir = path.dirname(STORAGE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Launch browser in headed mode (visible)
  const browser = await chromium.launch({
    headless: false,
  });

  // Create a new context
  const context = await browser.newContext();

  // Open ESPN fantasy hockey page
  console.log('Opening ESPN Fantasy Hockey...');
  const page = await context.newPage();
  await page.goto('https://fantasy.espn.com/hockey/', {
    waitUntil: 'networkidle',
  });

  console.log('\n📋 Instructions:');
  console.log('1. Log into your ESPN account in the browser window');
  console.log('2. Navigate to your fantasy league if needed');
  console.log('3. Press Enter in this terminal when you\'re done logging in\n');

  // Wait for user to press Enter
  await new Promise<void>((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const handler = (key: string) => {
      if (key === '\r' || key === '\n' || key === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        resolve();
      }
    };

    stdin.on('data', handler);
  });

  // Save storage state
  console.log('\nSaving session state...');
  const storageState = await context.storageState();
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(storageState, null, 2));

  await browser.close();

  console.log(`✅ Session saved to: ${STORAGE_PATH}`);
  console.log('\nYou can now use this session for ESPN scraping.\n');
}

captureESPNLogin().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

