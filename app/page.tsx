'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import StatsDisplay from '@/components/StatsDisplay';
import TeamInfo from '@/components/TeamInfo';
import Header from '@/components/Header';

function HomePageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab') || 'stats';

  const activeTab = tabParam === 'team-info' ? 'team-info' : 'stats';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">
          NHL Fantasy Hockey Analyzer
        </h1>

        {activeTab === 'team-info' ? <TeamInfo /> : <StatsDisplay />}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <Header />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Loading...</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}

