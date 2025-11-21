'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Home, Users, BarChart3 } from 'lucide-react'

import LeagueSyncButton from './LeagueSyncButton'

function NavigationLinks() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isActive = (path: string) => {
    if (path === '/') {
      const tab = searchParams?.get('tab')
      return pathname === '/' && !tab
    }
    if (path === '/?tab=stats') {
      return pathname === '/' && searchParams?.get('tab') === 'stats'
    }
    if (path === '/?tab=team-info') {
      return pathname === '/' && searchParams?.get('tab') === 'team-info'
    }
    return pathname?.startsWith(path)
  }

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/?tab=stats', label: 'Stats', icon: BarChart3 },
    { href: '/?tab=team-info', label: 'Team Info', icon: Users },
    { href: '/matchup-analyzer', label: 'Matchup Analyzer', icon: BarChart3 },
  ]

  return (
    <nav className="flex space-x-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${
                active
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }
            `}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function NavigationLinksFallback() {
  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/?tab=stats', label: 'Stats', icon: BarChart3 },
    { href: '/?tab=team-info', label: 'Team Info', icon: Users },
    { href: '/matchup-analyzer', label: 'Matchup Analyzer', icon: BarChart3 },
  ]

  return (
    <nav className="flex space-x-1">
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <Users className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">Fantasy Hockey Analytics</span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <LeagueSyncButton />
            <Suspense fallback={<NavigationLinksFallback />}>
              <NavigationLinks />
            </Suspense>
          </div>
        </div>
      </div>
    </header>
  )
}

