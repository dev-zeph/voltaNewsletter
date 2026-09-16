import type { Metadata } from 'next';
import { Instrument_Sans, Barlow_Condensed, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/AppShell';
import './globals.css';

// Matches trojancli.com's type system: a contemporary grotesque for body and
// headings, a condensed face reserved for small uppercase labels (eyebrows,
// table headers, the HEURISTIC badge), and a mono face for data.
const sans = Instrument_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const condensed = Barlow_Condensed({
  variable: '--font-condensed',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bob for Volta',
  description: "Bob sources, scores and drafts Volta's community newsletter.",
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable} ${mono.variable} h-full`}>
      <body className="h-full min-h-screen antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
