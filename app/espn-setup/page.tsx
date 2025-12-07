'use client';

import { useState } from 'react';

export default function ESPNSetupPage() {
  const [leagueId, setLeagueId] = useState('');
  const [season, setSeason] = useState('');
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">ESPN League Setup</h1>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                League ID
              </label>
              <input
                type="text"
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter ESPN League ID"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Season
              </label>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., 2026"
              />
            </div>
            
            <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Connect League
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

