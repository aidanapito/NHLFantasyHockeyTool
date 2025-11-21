/**
 * Test ESPN Fantasy League API Connection
 * 
 * Usage: node scripts/test-espn.js
 * 
 * This script will prompt you for your League ID and test the connection.
 * You can provide cookies if your league is private.
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function testESPNConnection() {
  console.log('\n=== ESPN Fantasy League API Tester ===\n');
  
  const leagueId = await question('Enter your League ID: ');
  const season = await question('Enter season year (e.g., 2025 for 2024-25): ') || '2025';
  const needsCookies = await question('Is your league private? (y/n): ');
  
  let espnCookies = null;
  
  if (needsCookies.toLowerCase() === 'y' || needsCookies.toLowerCase() === 'yes') {
    console.log('\nTo get your cookies:');
    console.log('1. Open your ESPN fantasy league in a browser');
    console.log('2. Press F12 to open Developer Tools');
    console.log('3. Go to Application → Cookies → fantasy.espn.com');
    console.log('4. Copy the SWID and espn_s2 values');
    console.log('\nPaste the cookies in this format:');
    console.log('SWID={value}; espn_s2={value}\n');
    
    espnCookies = await question('Paste your cookies here: ');
  }
  
  // Test the connection
  console.log('\n🧪 Testing connection...\n');
  
  const body = {
    leagueId,
    season,
  };
  
  if (espnCookies) {
    body.espnCookies = espnCookies;
  }
  
  try {
    const response = await fetch('http://localhost:3000/api/fantasy/test-espn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Successfully connected to ESPN!\n');
      console.log(`League: ${data.leagueName}`);
      console.log(`Season: ${data.season}`);
      console.log(`Teams: ${data.teamCount}`);
      console.log(`Scoring Type: ${data.scoringType || 'Unknown'}`);
      console.log(`Categories: ${data.categories.length > 0 ? data.categories.join(', ') : 'Default'}\n`);
      
      if (data.teams && data.teams.length > 0) {
        console.log('📊 Teams:');
        data.teams.slice(0, 5).forEach(team => {
          console.log(`  - ${team.name} (Owner: ${team.owner}, Roster: ${team.rosterSize} players)`);
        });
        if (data.teams.length > 5) {
          console.log(`  ... and ${data.teams.length - 5} more teams`);
        }
      }
      
      console.log('\n✨ Next step: Use the connect-league endpoint to save this data!');
      console.log('   curl -X POST http://localhost:3000/api/fantasy/connect-league \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log(`     -d \'{"platform":"espn","leagueId":"${leagueId}","season":"${season}"${espnCookies ? `,"espnCookies":"${espnCookies}"` : ''}}\'`);
      
    } else {
      console.log('❌ Connection failed\n');
      console.log(`Error: ${data.error || 'Unknown error'}`);
      console.log(`Message: ${data.message || 'No details available'}\n`);
      
      if (data.hints) {
        console.log('💡 Hints:');
        data.hints.forEach(hint => console.log(`   ${hint}`));
      }
    }
    
  } catch (error) {
    console.log('❌ Error making request:');
    console.log(error.message);
    console.log('\n💡 Make sure your Next.js dev server is running: npm run dev');
  }
  
  rl.close();
}

// Check if the server is running
fetch('http://localhost:3000/api/fantasy/test-espn', { method: 'GET' })
  .then(() => {
    testESPNConnection();
  })
  .catch(() => {
    console.log('❌ Could not connect to http://localhost:3000');
    console.log('💡 Make sure your Next.js dev server is running:');
    console.log('   npm run dev\n');
    rl.close();
  });


