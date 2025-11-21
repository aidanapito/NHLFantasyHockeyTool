'use client';

import { useState } from 'react';

export default function MatchupAnalyzerPage() {
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Matchup Analyzer</h1>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">Matchup analyzer coming soon</p>
        </div>
      </div>
    </div>
  );
}

