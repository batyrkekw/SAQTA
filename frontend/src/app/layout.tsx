import { AccountProvider } from '@/features/account/account';
import { LanguageProvider } from '@/components/language-provider';
import { WorkspaceLayout } from '@/components/workspace-layout';
import { WakeBanner } from '@/components/wake-banner';
import type { Metadata,Viewport } from 'next';
import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './globals.css';
import '@/components/product-theme.css';

export const metadata: Metadata = {
  applicationName: 'SaqtaFood',
  icons: { icon: '/brand/favicon.svg', apple: '/brand/app-icon.svg' },
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#123C2F' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-scroll-behavior="smooth"><body><LanguageProvider><AccountProvider><WorkspaceLayout>{children}</WorkspaceLayout><WakeBanner /></AccountProvider></LanguageProvider></body></html>;
}
