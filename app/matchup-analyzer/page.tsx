'use client';

import Header from '@/components/Header';
import MatchupAnalyzer from '@/components/MatchupAnalyzer';

export default function MatchupAnalyzerPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">
          Matchup Analyzer
        </h1>
        <MatchupAnalyzer />
      </div>
    </div>
  );
}

