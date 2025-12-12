/**
 * API Route for Scraping ESPN Standings
 * 
 * Uses Playwright with a persisted session file to scrape ESPN standings
 */

import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const STORAGE_PATH = path.join(process.cwd(), '.playwright', 'espn-storage.json');

interface StandingsEntry {
  rank: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  pointsFor: number;
  pointsAgainst: number;
  // Category stats
  G?: number;      // Goals
  A?: number;      // Assists
  plusMinus?: number; // +/-
  PIM?: number;    // Penalty Minutes
  PPP?: number;    // Power Play Points
  FOW?: number;    // Faceoffs Won
  SOG?: number;    // Shots on Goal
  HIT?: number;    // Hits
  BLK?: number;    // Blocks
  W?: number;      // Goalie Wins
  SO?: number;     // Shutouts
  GAA?: number;    // Goals Against Average
  SV?: number;     // Save Percentage (as decimal, e.g., 0.925)
  [key: string]: any; // Allow additional stat categories
}

/**
 * GET /api/fantasy/espn-standings
 * Scrapes ESPN standings table for the given league
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');
    const season = searchParams.get('season') || '2026';

    if (!leagueId) {
      return NextResponse.json(
        { error: 'leagueId is required' },
        { status: 400 }
      );
    }

    // Check if storage file exists
    if (!fs.existsSync(STORAGE_PATH)) {
      return NextResponse.json(
        { 
          error: 'ESPN session not found. Please run "npm run espn-login" first to capture your login session.',
          hint: 'Run: npm run espn-login'
        },
        { status: 401 }
      );
    }

    // Load storage state
    const storageState = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'));

    // Launch browser - try different modes for macOS compatibility
    // macOS often blocks headless browsers, especially headless-shell
    // Try regular chromium first (most stable on macOS)
    let browser
    let browserLaunched = false
    
    // Strategy: Try headed mode first (most compatible with macOS)
    // Then fallback to headless if headed fails
    const launchOptions = [
      {
        headless: false,
        name: 'headed mode',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Helpful for macOS
      },
      {
        headless: true,
        name: 'headless mode',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    ]

    for (const options of launchOptions) {
      try {
        console.log(`Attempting to launch browser in ${options.name}...`)
        browser = await chromium.launch({
          headless: options.headless,
          timeout: 60000,
          args: options.args,
        })
        
        // Verify browser is actually alive by checking if it's connected
        try {
          // Simple check: try to create a test context (fastest way to verify browser is alive)
          const testContext = await browser.newContext()
          await testContext.close()
          console.log(`Browser launched successfully in ${options.name}`)
          browserLaunched = true
          break
        } catch (verifyError: any) {
          console.warn(`Browser launched but verification failed: ${verifyError.message}`)
          try {
            await browser.close()
          } catch {
            // Ignore close errors
          }
          browser = null
        }
      } catch (launchError: any) {
        console.warn(`${options.name} launch failed: ${launchError.message}`)
        // Continue to next option
      }
    }

    if (!browserLaunched || !browser) {
      throw new Error(
        'Failed to launch browser in all modes. This is likely a macOS security/permissions issue. ' +
        'Try: 1) Grant Full Disk Access to your terminal in System Preferences, 2) Restart your terminal, ' +
        '3) Run: npx playwright install chromium'
      )
    }

    // Create context with stored authentication
    let context
    try {
      context = await browser.newContext({
        storageState,
      });
    } catch (contextError: any) {
      await browser.close()
      throw new Error(`Failed to create browser context: ${contextError.message}. Browser may have crashed.`)
    }

    let page
    try {
      page = await context.newPage();
    } catch (pageError: any) {
      await context.close()
      await browser.close()
      throw new Error(`Failed to create page: ${pageError.message}. Browser may have crashed.`)
    }

    try {

      // Navigate to ESPN standings page
      // Try to find the page that shows category statistics
      const baseUrl = `https://fantasy.espn.com/hockey/league/standings?leagueId=${leagueId}&seasonId=${season}`;
      
      console.log(`Navigating to ESPN standings: ${baseUrl}`);
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      // After page loads, try to find and click the "Statistics" or "Category Leaders" tab
      // ESPN often has these as tabs or buttons on the standings page
      try {
        // Wait a moment for dynamic content
        await page.waitForTimeout(2000);
        
        // Look for tabs/buttons that might show category stats
        // Common patterns: "Statistics", "Category Leaders", "Stats", "View All Stats"
        const tabSelectors = [
          'button >> text=/statistics/i',
          'button >> text=/category/i',
          '[role="tab"] >> text=/statistics/i',
          '[role="tab"] >> text=/category/i',
          'a >> text=/statistics/i',
          'a >> text=/category/i',
        ];
        
        for (const selector of tabSelectors) {
          try {
            const tab = page.locator(selector).first();
            if (await tab.count() > 0) {
              console.log(`Found category stats tab: ${selector}`);
              await tab.click();
              await page.waitForTimeout(3000); // Wait for content to load
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Also try clicking any button that contains "stat" or "category" in its text
        const allButtons = await page.$$('button, [role="tab"], a');
        for (const button of allButtons.slice(0, 30)) {
          try {
            const text = (await button.textContent())?.toLowerCase() || '';
            if ((text.includes('stat') || text.includes('category') || text.includes('leader')) && 
                !text.includes('standing')) {
              console.log(`Clicking button: ${text}`);
              await button.click();
              await page.waitForTimeout(3000);
              break;
            }
          } catch (e) {
            // Continue
          }
        }
      } catch (e) {
        console.log('Could not find/click category stats tab, proceeding with default view');
      }

      // Wait for standings table to load
      await page.waitForSelector('table, [class*="standings"], [class*="Table"], [class*="statistics"]', {
        timeout: 15000,
      });

      // Try to find and click a tab or button that shows category stats
      // ESPN often has tabs like "Standings" vs "Statistics" or "Category Leaders"
      try {
        console.log('Looking for category stats tab/button...');
        
        // Simplify - just look for buttons with text containing "stat" or "category"
        const allButtons = await page.$$('button, [role="tab"], a[role="tab"]');
        console.log(`Found ${allButtons.length} potential buttons/tabs to check`);
        
        for (const button of allButtons.slice(0, 20)) { // Limit to first 20 to avoid hanging
          try {
            const buttonText = await button.textContent();
            if (buttonText && (
              buttonText.toLowerCase().includes('stat') || 
              buttonText.toLowerCase().includes('category') ||
              buttonText.toLowerCase().includes('leader')
            )) {
              console.log(`Found potential category stats button: ${buttonText}`);
              await button.click();
              await page.waitForTimeout(3000); // Wait for content to load
              break;
            }
          } catch (e) {
            // Continue
          }
        }
      } catch (e) {
        console.log('Could not find category stats tab/button, using default view:', e);
      }

      // Wait a bit for any dynamic content to load
      console.log('Waiting for table to stabilize...');
      await page.waitForTimeout(2000);
      

      // Scrape the standings tables (there are TWO: standings and season stats)
      console.log('Starting to scrape tables...');
      const standings = await page.evaluate(() => {
        const results: StandingsEntry[] = [];
        const teamDataMap: Map<string, any> = new Map();
        let firstRowDebug: any = null; // Debug info for first row - declared at top level

        // Find ALL tables on the page (nested or not)
        const allTables = document.querySelectorAll('table');
        // Also check if there are nested tables we need to include
        const debugInfo = {
          totalTables: allTables.length,
          tableHeaders: [] as string[],
        };
        // Collect info about all tables for debugging
        allTables.forEach((t, idx) => {
          const headerRow = t.querySelector('thead tr, tr:first-child');
          if (headerRow) {
            const headerText = headerRow.textContent?.substring(0, 200) || 'No text';
            debugInfo.tableHeaders.push(`Table ${idx + 1}: ${headerText}`);
          }
          // Also check if this table has nested table elements (tables within tables)
          const nestedTables = t.querySelectorAll('table');
          if (nestedTables.length > 0) {
            console.log(`Table ${idx + 1} has ${nestedTables.length} nested tables`);
          }
        });

        // FIRST: Scrape the top "League Standings" table (W, L, T, PCT, GB)
        let standingsTable: HTMLTableElement | null = null;
        for (const t of Array.from(allTables)) {
          if (!(t instanceof HTMLTableElement)) continue;
          
          const headerRow = t.querySelector('thead tr, tr:first-child');
          if (!headerRow) continue;
          
          const headerText = headerRow.textContent?.toUpperCase() || '';
          // Look for the standings table with W, L, T, PCT
          if (headerText.includes('RK') && headerText.includes('TEAM') && 
              headerText.includes('W') && headerText.includes('L') && 
              headerText.includes('PCT') && !headerText.includes('G ')) {
            standingsTable = t;
            break;
          }
        }

        if (standingsTable) {
          const headerRow = standingsTable.querySelector('thead tr, tr:first-child');
          if (headerRow) {
            const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
            const headers = headerCells.map(cell => cell.textContent?.trim().toUpperCase() || '');
            
            const rows = Array.from(standingsTable.querySelectorAll('tbody tr, tr:not(:first-child)'));
            
            rows.forEach((row) => {
              const cells = Array.from(row.querySelectorAll('td, th'));
              if (cells.length === 0) return;
              
              const entry: any = {};
              
              cells.forEach((cell, idx) => {
                const text = cell.textContent?.trim() || '';
                const header = headers[idx] || '';
                
                if (header === 'RK' || header === 'RANK') {
                  entry.rank = parseInt(text) || 0;
                } else if (header === 'TEAM') {
                  entry.teamName = text;
                } else if (header === 'W') {
                  entry.wins = parseFloat(text) || 0;
                } else if (header === 'L') {
                  entry.losses = parseFloat(text) || 0;
                } else if (header === 'T') {
                  entry.ties = parseFloat(text) || 0;
                } else if (header === 'PCT') {
                  entry.winPercentage = parseFloat(text.replace('%', '').replace(',', '')) || 0;
                  if (entry.winPercentage > 1 && entry.winPercentage <= 100) {
                    entry.winPercentage = entry.winPercentage / 100;
                  }
                } else if (header === 'PF' || header === 'POINTS FOR') {
                  entry.pointsFor = parseFloat(text.replace(',', '')) || 0;
                } else if (header === 'PA' || header === 'POINTS AGAINST') {
                  entry.pointsAgainst = parseFloat(text.replace(',', '')) || 0;
                }
              });
              
              if (entry.teamName) {
                teamDataMap.set(entry.teamName, entry);
              }
            });
          }
        }

        // SECOND: Scrape the bottom "Season Stats" table (G, A, PIM, etc.)
        // ESPN often has SKATERS and GOALIES as separate sections, or combined
        let seasonStatsTable: HTMLTableElement | null = null;
        
        // Try to find the Season Stats table - it might have "SEASON STATS" or "SKATERS" header
        for (const t of Array.from(allTables)) {
          if (!(t instanceof HTMLTableElement)) continue;
          
          // Check if this is the standings table we already found - skip it
          if (t === standingsTable) continue;
          
          const headerRow = t.querySelector('thead tr, tr:first-child');
          if (!headerRow) continue;
          
          const headerText = headerRow.textContent?.toUpperCase() || '';
          // Look for the season stats table with G, A, PIM, etc.
          // Also check for SKATERS or GOALIES sections
          if ((headerText.includes('G') && headerText.includes('A') && 
              (headerText.includes('PIM') || headerText.includes('SOG') || headerText.includes('HIT'))) ||
              headerText.includes('SKATERS') || headerText.includes('GOALIES')) {
            seasonStatsTable = t;
            break;
          }
        }
        
        // If no table found with headers, try ALL tables except the standings table
        if (!seasonStatsTable && allTables.length > 1) {
          // Try all tables except the standings table
          for (const t of Array.from(allTables)) {
            if (t instanceof HTMLTableElement && t !== standingsTable) {
              // Check if this table has multiple rows with team data
              const rows = t.querySelectorAll('tbody tr, tr');
              if (rows.length > 5) { // Likely a data table if it has many rows
                seasonStatsTable = t;
                break;
              }
            }
          }
        }

        // Declare these outside the if block so we can use them in debug info
        let allHeaderRows: NodeListOf<Element> | null = null;
        let dataRows: Element[] | null = null;
        let bestHeaderRow: Element | null = null;
        let headerRowIndex = 0;
        let headers: string[] = [];
        
        if (seasonStatsTable) {
          console.log('Found season stats table!');
          
          // ESPN might have SKATERS and GOALIES in separate sections or rows
          // Look for all header rows (there might be multiple for SKATERS/GOALIES)
          allHeaderRows = seasonStatsTable.querySelectorAll('thead tr, tr:first-child, [class*="header"]');
          // Get ALL rows, then filter to skip the header rows
          const allRows = Array.from(seasonStatsTable.querySelectorAll('tbody tr, tr'));
          
          // Find the most comprehensive header row
          // Find the row that contains stat headers (G, A, +/-, PIM, etc.) but is NOT numeric data
          bestHeaderRow = null;
          for (let i = 0; i < Math.min(5, allRows.length); i++) {
            const row = allRows[i];
            const rowText = row.textContent || '';
            // Check if this looks like a header row (has stat names but not many consecutive numbers)
            if (rowText.includes('G') && rowText.includes('A') && rowText.includes('PIM') && 
                !rowText.match(/^\d+\d+\d+/)) { // Not a row that starts with many numbers
              bestHeaderRow = row;
              headerRowIndex = i;
              break;
            }
          }
          // Fallback: use row at index 2 if nothing found
          if (!bestHeaderRow && allRows.length > 2) {
            bestHeaderRow = allRows[2];
            headerRowIndex = 2;
          }
          
          // Re-slice dataRows to skip all rows up to and including the header row
          dataRows = allRows.slice(headerRowIndex + 1);
          
          if (bestHeaderRow) {
            const headerCells = Array.from(bestHeaderRow.querySelectorAll('th, td'));
            headers = headerCells.map((cell, idx) => {
              const text = cell.textContent?.trim() || '';
              const upperText = text.toUpperCase();
              
              // Handle +/- variations first
              if (upperText.includes('+/-') || 
                  (upperText.includes('PLUS') && upperText.includes('MINUS'))) {
                return 'PLUS_MINUS';
              }
              
              // Handle SV% 
              if (upperText.includes('SV') && upperText.includes('%')) {
                return 'SV';
              }
              
              // Map common headers explicitly
              if (upperText === 'RK' || upperText === 'RANK') return 'RK';
              if (upperText === 'TEAM') return 'TEAM';
              if (upperText === 'G' || (upperText.includes('GOALS') && !upperText.includes('AGAINST'))) return 'G';
              if (upperText === 'A' || upperText.includes('ASSISTS')) return 'A';
              if (upperText === 'PIM') return 'PIM';
              if (upperText === 'PPP') return 'PPP';
              if (upperText === 'FOW') return 'FOW';
              if (upperText === 'SOG') return 'SOG';
              if (upperText === 'HIT') return 'HIT';
              if (upperText === 'BLK' || upperText === 'BLKS' || upperText === 'BLKSBLOCKED') return 'BLK';
              if (upperText === 'W' && idx >= 9) return 'W_GOALIE'; // Goalie wins come after skater stats (idx 9+)
              if (upperText === 'SO' || upperText.includes('SHUTOUTS')) return 'SO';
              if (upperText === 'GAA') return 'GAA';
              if (upperText === 'SV') return 'SV';
              
              // Clean up - keep letters and numbers, but preserve +/- and %
              // Note: - must be at the end or escaped to avoid being interpreted as a range
              let cleaned = upperText.replace(/[^A-Z0-9+/%-]/g, '');
              
              // Skip empty headers
              if (cleaned.length === 0) return '';
              
              return cleaned;
            });
            
            // Process all data rows
            // ESPN might have SKATERS and GOALIES sections - we need to process both
            let inSkatersSection = true;
            let inGoaliesSection = false;
            let currentHeaders = headers; // Track which headers to use
            
            // Convert teamDataMap to array so we can match by index
            const teamArray = Array.from(teamDataMap.values());
            
            dataRows.forEach((row, rowIndex) => {
              const cells = Array.from(row.querySelectorAll('td, th'));
              if (cells.length === 0) return;
              
              const rowText = row.textContent?.toUpperCase() || '';
              
              // Check if this is a section header row - if so, find the header row for this section
              if (rowText.includes('SKATERS')) {
                inSkatersSection = true;
                inGoaliesSection = false;
                // Look for header row right after SKATERS
                const nextRow = row.nextElementSibling;
                if (nextRow) {
                  const headerCells = nextRow.querySelectorAll('th, td');
                  if (headerCells.length > 5) {
                    // This might be the header row for SKATERS section
                    currentHeaders = Array.from(headerCells).map(cell => {
                      const text = cell.textContent?.trim().toUpperCase() || '';
                      if (text.includes('+/-') || (text.includes('PLUS') && text.includes('MINUS'))) return 'PLUS_MINUS';
                      if (text === 'G') return 'G';
                      if (text === 'A') return 'A';
                      if (text === 'PIM') return 'PIM';
                      if (text === 'PPP') return 'PPP';
                      if (text === 'FOW') return 'FOW';
                      if (text === 'SOG') return 'SOG';
                      if (text === 'HIT') return 'HIT';
                      if (text === 'BLK' || text === 'BLKS') return 'BLK';
                      if (text === 'RK' || text === 'RANK') return 'RK';
                      if (text === 'TEAM') return 'TEAM';
                      return text.replace(/[^A-Z0-9]/g, '');
                    });
                  }
                }
                return; // Skip SKATERS header row
              }
              
              if (rowText.includes('GOALIES')) {
                inSkatersSection = false;
                inGoaliesSection = true;
                // Look for header row right after GOALIES
                const nextRow = row.nextElementSibling;
                if (nextRow) {
                  const headerCells = nextRow.querySelectorAll('th, td');
                  if (headerCells.length > 3) {
                    // This might be the header row for GOALIES section
                    currentHeaders = Array.from(headerCells).map(cell => {
                      const text = cell.textContent?.trim().toUpperCase() || '';
                      if (text === 'W') return 'W_GOALIE';
                      if (text === 'SO') return 'SO';
                      if (text === 'GAA') return 'GAA';
                      if (text.includes('SV') && text.includes('%')) return 'SV';
                      if (text === 'RK' || text === 'RANK') return 'RK';
                      if (text === 'TEAM') return 'TEAM';
                      return text.replace(/[^A-Z0-9]/g, '');
                    });
                  }
                }
                return; // Skip GOALIES header row
              }
              
              // Skip header rows
              if (rowText.includes('RK') && rowText.includes('TEAM') && 
                  (rowText.includes('G') || rowText.includes('W'))) {
                // This is a header row - update currentHeaders
                const headerCells = cells;
                if (headerCells.length > 5) {
                  currentHeaders = Array.from(headerCells).map((cell, cellIdx) => {
                    const text = cell.textContent?.trim().toUpperCase() || '';
                    if (text.includes('+/-') || (text.includes('PLUS') && text.includes('MINUS'))) return 'PLUS_MINUS';
                    if (text.includes('SV') && text.includes('%')) return 'SV';
                    if (text === 'RK' || text === 'RANK') return 'RK';
                    if (text === 'TEAM') return 'TEAM';
                    if (text === 'G' || text.includes('GOALS')) return 'G';
                    if (text === 'A' || text.includes('ASSISTS')) return 'A';
                    if (text === 'PIM') return 'PIM';
                    if (text === 'PPP') return 'PPP';
                    if (text === 'FOW') return 'FOW';
                    if (text === 'SOG') return 'SOG';
                    if (text === 'HIT') return 'HIT';
                    if (text === 'BLK' || text === 'BLKS') return 'BLK';
                    if (text === 'W' && cellIdx > 10) return 'W_GOALIE';
                    if (text === 'SO') return 'SO';
                    if (text === 'GAA') return 'GAA';
                    if (text === 'SV') return 'SV';
                    return text.replace(/[^A-Z0-9]/g, '');
                  });
                }
                return; // Skip this header row
              }
              
              // Skip if this row doesn't have enough cells (likely not data)
              if (cells.length < 3) return;
              
              let teamName = '';
              const stats: any = {};
              
              // Make sure we use the correct header array
              const activeHeaders = currentHeaders.length >= cells.length ? currentHeaders : headers;
              const headerCount = activeHeaders.length;
              const cellCount = cells.length;
              
              // Use the shorter of the two to avoid index errors
              const maxIdx = Math.min(headerCount, cellCount);
              
              
              cells.slice(0, maxIdx).forEach((cell, idx) => {
                const text = cell.textContent?.trim() || '';
                if (!text || text === '-' || text === '—') return;
                
                // Use activeHeaders which might have been updated for the section
                const header = (activeHeaders[idx] || '').toUpperCase();
                
                // Find team name - usually in the second column (after RK) or first if no RK
                if (header === 'TEAM' || header === 'RK') {
                  // Extract team name (remove owner name in parentheses)
                  if (!text.match(/^\d+$/)) {
                    const teamMatch = text.match(/^([^(]+)/);
                    if (teamMatch) {
                      teamName = teamMatch[1].trim();
                    }
                  }
                } else if (idx === 1 && !text.match(/^\d+$/) && !teamName) {
                  // Second column might be team name
                  teamName = text.split('(')[0].trim();
                } else if (idx === 0 && !text.match(/^\d+$/) && !teamName && !header) {
                  // First column might be team name if no header
                  teamName = text.split('(')[0].trim();
                }
                
                // Parse stats based on header and section (SKATERS vs GOALIES)
                if (inSkatersSection) {
                  // Skater stats
                  if (header === 'G') {
                    stats.G = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'A') {
                    stats.A = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'PLUS_MINUS') {
                    stats.plusMinus = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'PIM') {
                    stats.PIM = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'PPP') {
                    stats.PPP = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'FOW') {
                    stats.FOW = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'SOG') {
                    stats.SOG = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'HIT') {
                    stats.HIT = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'BLK') {
                    stats.BLK = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'W_GOALIE' || header === 'W') {
                    stats.W = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'SO') {
                    stats.SO = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'GAA') {
                    stats.GAA = parseFloat(text) || 0;
                  } else if (header === 'SV') {
                    let svValue = parseFloat(text.replace('%', '').replace(',', '')) || 0;
                    if (svValue > 1 && svValue <= 100) {
                      svValue = svValue / 100;
                    } else if (svValue > 100) {
                      svValue = svValue / 1000;
                    }
                    stats.SV = svValue;
                  }
                } else if (inGoaliesSection) {
                  // Goalie stats only
                  if (header === 'W_GOALIE' || header === 'W') {
                    stats.W = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'SO') {
                    stats.SO = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'GAA') {
                    stats.GAA = parseFloat(text) || 0;
                  } else if (header === 'SV') {
                    let svValue = parseFloat(text.replace('%', '').replace(',', '')) || 0;
                    if (svValue > 1 && svValue <= 100) {
                      svValue = svValue / 100;
                    } else if (svValue > 100) {
                      svValue = svValue / 1000;
                    }
                    stats.SV = svValue;
                  }
                } else {
                  // Fallback: try to parse anyway if we're not sure which section
                  if (header === 'G') {
                    stats.G = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'A') {
                    stats.A = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'PLUS_MINUS') {
                    stats.plusMinus = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'PIM') {
                    stats.PIM = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'PPP') {
                    stats.PPP = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'FOW') {
                    stats.FOW = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'SOG') {
                    stats.SOG = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'HIT') {
                    stats.HIT = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'BLK') {
                    stats.BLK = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'W_GOALIE' || header === 'W') {
                    stats.W = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'SO') {
                    stats.SO = parseFloat(text.replace(',', '')) || 0;
                  } else if (header === 'GAA') {
                    stats.GAA = parseFloat(text) || 0;
                  } else if (header === 'SV') {
                    let svValue = parseFloat(text.replace('%', '').replace(',', '')) || 0;
                    if (svValue > 1 && svValue <= 100) {
                      svValue = svValue / 100;
                    } else if (svValue > 100) {
                      svValue = svValue / 1000;
                    }
                    stats.SV = svValue;
                  }
                }
              });
              
              // Match by index if no team name found
              if (teamName && Object.keys(stats).length > 0) {
                // Try to match with existing team data - be more flexible with matching
                let matchedTeam = null;
                for (const [existingTeamName, existingData] of Array.from(teamDataMap.entries())) {
                  // Normalize names for matching - remove punctuation, spaces, case differences
                  const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const existingNorm = normalize(existingTeamName);
                  const currentNorm = normalize(teamName);
                  
                  // Match by exact normalized name or if one name is a significant substring of the other
                  if (existingNorm === currentNorm) {
                    matchedTeam = existingTeamName;
                    break;
                  }
                  
                  // Try partial matching (handle cases like "Boeser than You" vs "Boeser than You (Bridget...)")
                  const existingWords = existingTeamName.toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 2);
                  const currentWords = teamName.toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 2);
                  
                  // Match if they share significant words
                  const commonWords = existingWords.filter((w: string) => currentWords.includes(w));
                  if (commonWords.length >= 2 || (commonWords.length === 1 && commonWords[0].length > 4)) {
                    matchedTeam = existingTeamName;
                    break;
                  }
                  
                  // Last resort: check if one contains the other
                  if (existingTeamName.toLowerCase().includes(teamName.toLowerCase()) ||
                      teamName.toLowerCase().includes(existingTeamName.toLowerCase())) {
                    matchedTeam = existingTeamName;
                    break;
                  }
                }
                
                if (matchedTeam) {
                  // Merge stats into existing entry - overwrite with any non-zero/valid values
                  const existing = teamDataMap.get(matchedTeam);
                  Object.keys(stats).forEach(key => {
                    const value = stats[key];
                    if (value !== undefined && value !== null && value !== '') {
                      // Always overwrite, even if 0 (some stats can legitimately be 0)
                      existing[key] = value;
                    }
                  });
                }
              } else if (Object.keys(stats).length > 0 && teamArray.length > rowIndex) {
                // No team name found, match by index
                const matchedTeam = teamArray[rowIndex];
                if (matchedTeam && matchedTeam.teamName) {
                  const existing = teamDataMap.get(matchedTeam.teamName);
                  Object.keys(stats).forEach(key => {
                    const value = stats[key];
                    if (value !== undefined && value !== null && value !== '') {
                      existing[key] = value;
                    }
                  });
                }
              }
            });
          }
        } else {
          console.log('Season stats table not found');
        }

        // Convert map to array
        const allTeams = Array.from(teamDataMap.values());
        
        // If no results but we have headers, return debug info
        if (allTeams.length === 0) {
          return {
            error: 'Could not find any team data',
            debug: {
              ...debugInfo,
              standingsTableFound: !!standingsTable,
              seasonStatsTableFound: !!seasonStatsTable,
            },
          };
        }
        
        // Check if we got category stats
        const hasCategoryStats = allTeams.some(team => team.G || team.A || team.PIM || team.HIT);
        
        // Collect debug info
        const debugData: any = {
          ...debugInfo,
          seasonStatsTableFound: !!seasonStatsTable,
          teamsCount: allTeams.length,
          hasCategoryStats,
          firstRowDebug: firstRowDebug || null,
          seasonStatsTableDebug: seasonStatsTable ? {
            headerRows: allHeaderRows?.length || 0,
            dataRows: dataRows?.length || 0,
            firstDataRowText: dataRows && dataRows.length > 0 ? dataRows[0].textContent?.substring(0, 200) : 'No data rows',
            secondDataRowText: dataRows && dataRows.length > 1 ? dataRows[1].textContent?.substring(0, 200) : 'No second row',
            thirdDataRowText: dataRows && dataRows.length > 2 ? dataRows[2].textContent?.substring(0, 200) : 'No third row',
            firstRowCells: dataRows && dataRows.length > 0 ? Array.from(dataRows[0].querySelectorAll('td, th')).map(c => c.textContent?.trim().substring(0, 30)) : [],
            row4Text: dataRows && dataRows.length > 3 ? dataRows[3].textContent?.substring(0, 200) : 'No row 4',
            row5Text: dataRows && dataRows.length > 4 ? dataRows[4].textContent?.substring(0, 200) : 'No row 5',
            row6Text: dataRows && dataRows.length > 5 ? dataRows[5].textContent?.substring(0, 200) : 'No row 6',
            firstRowWithTeam: dataRows && dataRows.length > 0 ? Array.from(dataRows[0].querySelectorAll('td, th')).slice(0, 15).map(c => ({
              text: c.textContent?.trim().substring(0, 30),
              class: c.className,
              parentText: c.parentElement?.textContent?.substring(0, 100),
            })) : [],
            sampleHeaderRows: allHeaderRows && allHeaderRows.length > 0 ? Array.from(allHeaderRows).slice(0, 17).map((row, idx) => ({
              idx: idx,
              cells: row.querySelectorAll('th, td').length,
              text: row.textContent?.substring(0, 200),
            })) : [],
            parsedHeaders: bestHeaderRow ? Array.from(bestHeaderRow.querySelectorAll('th, td')).map(c => c.textContent?.trim().substring(0, 20)).slice(0, 15) : [],
            normalizedHeaders: headers ? headers.slice(0, 15) : [],
            bestHeaderRowText: bestHeaderRow?.textContent?.substring(0, 200) || 'No bestHeaderRow',
            allRowsCount: seasonStatsTable ? Array.from(seasonStatsTable.querySelectorAll('tbody tr, tr')).length : 0,
            dataRowsStartText: dataRows && dataRows.length > 0 ? dataRows[0].textContent?.substring(0, 100) : 'No data rows',
            allRowsSample: seasonStatsTable ? Array.from(seasonStatsTable.querySelectorAll('tbody tr, tr')).slice(0, 5).map((row, idx) => ({
              idx: idx,
              cells: row.querySelectorAll('td, th').length,
              text: row.textContent?.substring(0, 100),
            })) : [],
            headerRowIndex: headerRowIndex,
          } : null,
        };
        
        if (!hasCategoryStats && !!seasonStatsTable) {
          // Return debug info about what we found
          debugData.sampleTeam = allTeams[0] ? Object.keys(allTeams[0]) : [];
          debugData.sampleTeamData = allTeams[0] || null;
        }

        return {
          results: allTeams,
          debugHeaders: {
            raw: [],
            normalized: [],
          },
          debugInfo: hasCategoryStats ? undefined : debugData,
          warning: !hasCategoryStats && !!seasonStatsTable ? 'Category stats table found but no stats extracted' : undefined,
          tableInfo: {
            totalTables: allTables.length,
            headers: debugInfo.tableHeaders,
            standingsTableFound: !!standingsTable,
            seasonStatsTableFound: !!seasonStatsTable,
          },
        };
      });

      await browser.close();

      console.log('Scraping complete, processing results...');

      // Check if we got an error from evaluate
      if (standings && typeof standings === 'object' && 'error' in standings) {
        console.error('Error from scraping:', standings);
        return NextResponse.json({
          success: false,
          error: standings.error,
          debug: standings.debug,
          message: 'Failed to scrape table',
        }, { status: 500 });
      }

      // Check if we got debug info instead of standings
      if (standings && typeof standings === 'object' && 'debug' in standings) {
        console.log('Debug info from scraping:', standings);
        return NextResponse.json({
          success: false,
          debug: standings,
          message: 'Table found but no standings data extracted. Check debug info for headers found.',
        });
      }

      // Extract results and debug info
      const extractedStandings = standings?.results || (Array.isArray(standings) ? standings : []);
      const debugHeaders = standings?.debugHeaders;
      const debugInfo = standings?.debugInfo;
      const warning = standings?.warning;

      // Log debug info
      if (debugInfo) {
        console.log('Debug info from scraping:', JSON.stringify(debugInfo, null, 2));
      }
      
      if (warning) {
        console.warn('⚠️ Warning:', warning);
      }

      // Log headers found for debugging
      if (debugHeaders) {
        console.log('Headers found on ESPN page:', {
          raw: debugHeaders.raw,
          normalized: debugHeaders.normalized,
        });
      }

      if (extractedStandings && extractedStandings.length > 0) {
        console.log(`Extracted ${extractedStandings.length} teams. Sample entry:`, JSON.stringify(extractedStandings[0], null, 2));
        
        // Check if category stats are present
        const sample = extractedStandings[0];
        const hasCategoryStats = !!(sample.G || sample.A || sample.PIM || sample.PPP || sample.FOW || sample.SOG || sample.HIT || sample.BLK);
        if (!hasCategoryStats) {
          console.warn('⚠️ Category stats (G, A, PIM, etc.) not found in standings.');
          if (debugInfo) {
            console.warn('Debug info:', debugInfo);
          }
        }
      }

      if (!extractedStandings || extractedStandings.length === 0) {
        return NextResponse.json(
          { 
            error: 'No standings data found. The table structure may have changed.',
            hint: 'Check the ESPN page structure or league permissions',
            debugHeaders,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        leagueId,
        season,
        standings: extractedStandings,
        debugHeaders: debugHeaders ? {
          raw: debugHeaders.raw,
          normalized: debugHeaders.normalized,
        } : undefined,
        tableInfo: standings?.tableInfo,
        debugInfo: standings?.debugInfo,
      });

    } catch (scrapingError: any) {
      // Check if it's an authentication error before closing
      let isAuthError = false;
      try {
        const currentUrl = page?.url();
        if (currentUrl?.includes('login')) {
          isAuthError = true;
        }
      } catch {
        // Page might be closed
      }

      // Try to close browser gracefully
      try {
        if (browser) {
          await browser.close();
        }
      } catch (closeError) {
        // Browser might already be closed - ignore
        console.warn('Browser already closed or error closing:', closeError);
      }
      
      if (scrapingError.message?.includes('Could not find') || isAuthError) {
        return NextResponse.json(
          { 
            error: 'Authentication failed. Session may have expired. Please run "npm run espn-login" again.',
            hint: 'Run: npm run espn-login'
          },
          { status: 401 }
        );
      }

      // Check if it's a browser launch/close error
      if (scrapingError.message?.includes('Target page, context or browser has been closed') || 
          scrapingError.message?.includes('browserType.launch')) {
        console.error('Browser crashed or failed to launch. This may be a macOS permissions issue.')
        return NextResponse.json(
          { 
            error: 'Browser failed to launch. This may be a macOS permissions issue with Playwright.',
            message: 'The Playwright browser process is being killed immediately. This could be due to macOS security settings.',
            hint: 'Try: 1) Check System Preferences > Security & Privacy > Privacy > Full Disk Access for your terminal/node, 2) Try restarting your terminal, 3) Run: npm run espn-login again',
            details: scrapingError.message
          },
          { status: 500 }
        );
      }

      throw scrapingError;
    }

  } catch (error: any) {
    console.error('Error scraping ESPN standings:', error);
    return NextResponse.json(
      { 
        error: 'Failed to scrape ESPN standings',
        message: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

