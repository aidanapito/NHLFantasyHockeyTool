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
import * as readline from 'readline';

const STORAGE_PATH = path.join(process.cwd(), '.playwright', 'espn-storage.json');

async function captureESPNLogin() {
  console.log('\n=== ESPN Login Session Capture ===\n');
  console.log('This will open a browser window for you to log into ESPN.');
  console.log('Once logged in, come back to this terminal and press Enter to save.\n');

  // Ensure .playwright directory exists
  const dir = path.dirname(STORAGE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Launch browser in headed mode (visible)
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Create a new context
  const context = await browser.newContext();

  // Open ESPN fantasy hockey page
  console.log('Opening ESPN Fantasy Hockey...');
  const page = await context.newPage();
  
  try {
    await page.goto('https://fantasy.espn.com/hockey/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
  } catch (e: any) {
    console.log('Note: Page load may have been slow, but browser should be open.');
  }

  console.log('\n📋 Instructions:');
  console.log('1. Log into your ESPN account in the browser window that just opened');
  console.log('2. Navigate to your fantasy hockey league');
  console.log('3. Come back here and press ENTER when you\'re logged in\n');

  // Use readline to wait for user input (works in all terminal types)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise<void>((resolve) => {
    rl.question('Press ENTER when you are logged into ESPN and on your league page: ', () => {
      rl.close();
      resolve();
    });
  });

  // Save storage state
  console.log('\nSaving session state...');
  try {
    const storageState = await context.storageState();
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(storageState, null, 2));
    console.log(`✅ Session saved to: ${STORAGE_PATH}`);
    console.log('\nYou can now use this session for ESPN scraping.\n');
  } catch (e: any) {
    console.error('Failed to save session:', e.message);
  }

  await browser.close();
}

captureESPNLogin().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
