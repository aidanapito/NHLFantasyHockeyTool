'use client';

import { useState } from 'react';

export default function ESPNSetupPage() {
  const [leagueId, setLeagueId] = useState('91445140'); // Your league ID
  const [year, setYear] = useState('2025');
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [leagueInfo, setLeagueInfo] = useState<any>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionStatus(null);

    try {
      const response = await fetch('/api/players/espn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'connect-league',
          leagueId: parseInt(leagueId),
          year: parseInt(year),
          espnS2: espnS2 || undefined,
          swid: swid || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setConnectionStatus('✅ Successfully connected to ESPN league!');
        setLeagueInfo(result.league_info);
      } else {
        setConnectionStatus(`❌ Failed to connect: ${result.error || result.message}`);
      }
    } catch (error) {
      setConnectionStatus(`❌ Error: ${error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleGetLeagueInfo = async () => {
    try {
      const response = await fetch('/api/players/espn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get-league-info',
          leagueId: parseInt(leagueId),
          year: parseInt(year),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setLeagueInfo(result);
      } else {
        setConnectionStatus(`❌ Failed to get league info: ${result.error}`);
      }
    } catch (error) {
      setConnectionStatus(`❌ Error: ${error}`);
    }
  };

  const handleTestPlayers = async () => {
    try {
      const response = await fetch(`/api/players/espn?leagueId=${leagueId}&year=${year}&limit=10`);
      const players = await response.json();

      if (response.ok) {
        setConnectionStatus(`✅ Found ${players.length} players in league`);
      } else {
        setConnectionStatus(`❌ Failed to fetch players: ${players.error}`);
      }
    } catch (error) {
      setConnectionStatus(`❌ Error: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            ESPN Fantasy Hockey Setup
          </h1>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">League Configuration</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    League ID
                  </label>
                  <input
                    type="text"
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="91445140"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Found in your ESPN league URL
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Season Year
                  </label>
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="2025"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-3">Authentication (Optional)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Only needed for private leagues. Get these from your browser's developer tools when logged into ESPN.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ESPN_S2 Cookie
                  </label>
                  <input
                    type="text"
                    value={espnS2}
                    onChange={(e) => setEspnS2(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Optional for private leagues"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SWID Cookie
                  </label>
                  <input
                    type="text"
                    value={swid}
                    onChange={(e) => setSwid(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Optional for private leagues"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? 'Connecting...' : 'Connect League'}
              </button>

              <button
                onClick={handleGetLeagueInfo}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Get League Info
              </button>

              <button
                onClick={handleTestPlayers}
                className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Test Players API
              </button>
            </div>

            {connectionStatus && (
              <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
                <p className="text-sm">{connectionStatus}</p>
              </div>
            )}

            {leagueInfo && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                <h3 className="font-medium mb-2">League Information</h3>
                <div className="text-sm space-y-1">
                  <p><strong>Name:</strong> {leagueInfo.league_name}</p>
                  <p><strong>Teams:</strong> {leagueInfo.num_teams}</p>
                  <p><strong>Current Week:</strong> {leagueInfo.current_week}</p>
                  <p><strong>Season:</strong> {leagueInfo.year}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
              How to Get ESPN Cookies
            </h3>
            <ol className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1 list-decimal list-inside">
              <li>Log into ESPN Fantasy Hockey in your browser</li>
              <li>Open Developer Tools (F12 or right-click → Inspect)</li>
              <li>Go to Application/Storage → Cookies → espn.com</li>
              <li>Find and copy the values for "ESPN_S2" and "SWID"</li>
              <li>Paste them into the fields above</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
