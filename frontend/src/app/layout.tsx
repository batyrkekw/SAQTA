import { AccountProvider } from '@/features/account/account';
import { LanguageProvider } from '@/components/language-provider';
import { WorkspaceLayout } from '@/components/workspace-layout';
import type { Metadata,Viewport } from 'next';
import './globals.css';
import '@/components/product-theme.css';

export const metadata: Metadata = {
  applicationName: 'SAQTA',
  icons: { icon: '/brand/favicon.svg', apple: '/brand/app-icon.svg' },
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#123C2F' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-scroll-behavior="smooth"><body><LanguageProvider><AccountProvider><WorkspaceLayout>{children}</WorkspaceLayout></AccountProvider></LanguageProvider></body></html>;
}
