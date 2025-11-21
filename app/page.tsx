import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">
          NHL Fantasy Hockey Analyzer
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            href="/trade-analyzer"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">Trade Analyzer</h2>
            <p className="text-gray-600">
              Analyze trades and get recommendations
            </p>
          </Link>
          
          <Link
            href="/matchup-analyzer"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">Matchup Analyzer</h2>
            <p className="text-gray-600">
              Analyze weekly matchups
            </p>
          </Link>
          
          <Link
            href="/espn-setup"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">ESPN Setup</h2>
            <p className="text-gray-600">
              Connect your ESPN league
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}

