'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveLeagueSettings } from '@/lib/league-settings';

export default function ESPNSetupPage() {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState('');
  const [season, setSeason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const handleConnect = async () => {
    if (!leagueId.trim()) {
      setError('Please enter a League ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fantasy/league/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leagueId: leagueId.trim(),
          season: season.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to connect league');
      }

      // Save league settings to localStorage
      saveLeagueSettings({
        leagueId: data.leagueId,
        season: data.season,
        lastSyncedAt: data.refreshedAt,
      });

      setSuccess(`Successfully connected to ${data.leagueName || 'league'}!`);
      
      // Redirect to home page after a short delay
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to connect league. Please check your League ID and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleConnect();
    }
  };
  
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
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="w-full border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter ESPN League ID"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Season (optional)
              </label>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="w-full border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="e.g., 20252026 (defaults to current season)"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                {success}
              </div>
            )}
            
            <button
              onClick={handleConnect}
              disabled={isLoading || !leagueId.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Connecting...' : 'Connect League'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

