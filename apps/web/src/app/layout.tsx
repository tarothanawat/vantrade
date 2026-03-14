import NavBar from '@/components/ui/NavBar';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VanTrade — Algorithmic Strategy Marketplace',
  description: 'Discover, verify, and run algorithmic trading strategies.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
