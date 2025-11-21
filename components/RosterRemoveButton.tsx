'use client';

import { useState } from 'react';

export default function RosterRemoveButton({ teamId, playerId, onRemoved }: { teamId: string; playerId: number; onRemoved?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removePlayer = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/fantasy/roster?teamId=${encodeURIComponent(teamId)}&playerId=${encodeURIComponent(String(playerId))}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      if (onRemoved) onRemoved();
      else if (typeof window !== 'undefined') window.location.reload();
    } catch (e: any) {
      setError(e.message || 'Failed to remove player');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={removePlayer}
        disabled={loading}
        className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400"
        title="Remove from roster"
      >
        {loading ? 'Removing…' : 'Remove'}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}


