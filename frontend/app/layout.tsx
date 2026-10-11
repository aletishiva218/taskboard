import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

const GA_ID = 'G-Q310CDW8DB';

export const metadata: Metadata = {
  title: 'TaskBoard — Real-time Collaborative Tasks',
  description: 'A production-grade real-time collaborative task board built with Next.js, Socket.io, and PostgreSQL.',
  icons: { icon: '/favicon.ico' },
  verification: {
    google: 'HBRocV13HUr3AVxyid-ojYz78aTLni8fkf2f4ElcEJM',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
