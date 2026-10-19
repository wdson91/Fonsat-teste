import type { Metadata } from 'next';
import { AppShell } from '../components/app-shell';
import { SessionProvider } from '../components/session';
import './globals.css';
export const metadata: Metadata = { title: 'Fonsat — Operações de obra', description: 'Assiduidade, equipas e faturação com histórico.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-PT"><body><SessionProvider><AppShell>{children}</AppShell></SessionProvider></body></html>;
}
