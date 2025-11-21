import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NHL Fantasy Hockey Analyzer',
  description: 'Advanced analytics for fantasy hockey',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

