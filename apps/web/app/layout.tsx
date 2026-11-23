import type { ReactNode } from 'react';

export const metadata = {
  metadataBase: new URL(process.env.PYROMETER_PUBLIC_URL || 'http://localhost:3000'),
  title: 'Pyrometer',
  description: 'How many AI tokens have you burned?',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
