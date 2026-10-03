import type { Metadata } from 'next'
import { StandaloneDashboard } from './StandaloneDashboard'

export const metadata: Metadata = {
  title: 'PIM Dashboard — PIM-Lite',
  description: 'Amazon readiness pipeline over the SFCC catalogue, built on the Sanity App SDK.',
}

export default function DashboardPage() {
  return <StandaloneDashboard />
}
