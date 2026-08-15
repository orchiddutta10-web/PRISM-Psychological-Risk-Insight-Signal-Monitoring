import { AppShell } from '@/components/layout/AppShell'

/** Route group layout for the four main authed dashboard pages. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
