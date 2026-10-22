import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlaceMatch',
  description: 'Campus placement management with semantic resume-JD matching',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Dark Reader) add attributes to <html>/<body>
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
