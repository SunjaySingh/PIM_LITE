'use client'

import dynamic from 'next/dynamic'
import { Splash } from './DashboardApp'

/**
 * The App SDK mounts a client-only store (it has no `getServerSnapshot`), so
 * the dashboard cannot be server-rendered — prerendering /dashboard fails
 * outright. Loading it with `ssr: false` keeps it off the server entirely.
 *
 * `ssr: false` is only allowed inside a Client Component, which is the whole
 * reason this thin wrapper exists between the server-rendered page (which owns
 * the route's metadata) and the app itself.
 */
const DashboardApp = dynamic(() => import('./DashboardApp'), {
  ssr: false,
  loading: () => <Splash>Loading PIM-Lite…</Splash>,
})

export function StandaloneDashboard() {
  return <DashboardApp />
}
