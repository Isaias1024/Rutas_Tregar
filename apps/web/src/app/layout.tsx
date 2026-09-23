import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

// La variable tiene que llamarse exactamente `--font-sans`: es la que `@theme
// inline` reenvia a `font-sans`, y con otro nombre el panel cae a la serif.
const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Todo el panel es interno: nunca debe indexarse, y no hay VPN ni Cloudflare
// Access delante que lo compense de otro modo.
export const metadata: Metadata = {
  title: 'Rutas',
  description: 'Panel de operacion de transporte de personal',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
