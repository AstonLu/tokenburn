import type { ReactNode } from 'react';

export const metadata = {
  metadataBase: new URL(process.env.TOKENBURN_PUBLIC_URL || 'http://localhost:3000'),
  title: 'Tokenburn',
  description: 'How many AI tokens have you burned?',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
