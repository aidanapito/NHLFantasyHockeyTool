'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import StatsDisplay from '@/components/StatsDisplay';
import TeamInfo from '@/components/TeamInfo';

function HomeContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  // Render content directly based on URL parameter
  if (tabParam === 'stats') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <StatsDisplay />
        </div>
      </main>
    );
  }

  if (tabParam === 'team-info') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <TeamInfo />
        </div>
      </main>
    );
  }

  // Default home content
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Fantasy Hockey Analytics
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Data-driven insights for competitive fantasy hockey managers
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-blue-600 mb-2">850+</div>
                <div className="text-gray-600">Players Tracked</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-blue-600 mb-2">Real-time</div>
                <div className="text-gray-600">Daily Updates</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-blue-600 mb-2">Advanced</div>
                <div className="text-gray-600">Analytics</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}