import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SAQTA — сохраняем еду с помощью данных', template: '%s · SAQTA' },
  description: 'Прогноз спроса, управление производством и продажа подходящих остатков для пекарен. Астана, Казахстан.',
  applicationName: 'SAQTA',
  icons: { icon: '/brand/favicon.svg', apple: '/brand/app-icon.svg' },
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#123C2F' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
