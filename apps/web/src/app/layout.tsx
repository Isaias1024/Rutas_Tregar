import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

// El sistema de diseno (§7) pide Inter con stack de sistema de respaldo. El
// nombre de la variable tiene que ser exactamente `--font-sans`: es el mismo
// nombre que `@theme inline` en globals.css reenvia hacia la utilidad
// `font-sans` de Tailwind — un nombre distinto (p. ej. el `--font-geist-sans`
// que trae la plantilla por defecto) deja esa variable sin valor y el
// navegador cae a su serif por defecto en todo el panel.
const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Todo el panel es interno: nunca debe indexarse, y no hay VPN ni Cloudflare
// Access delante que lo compense de otro modo (§1, §2).
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
