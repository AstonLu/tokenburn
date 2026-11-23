// Basic OG card: USD total and token total in plain text. Visual design is built separately.
import { ImageResponse } from 'next/og';
import { getProfileSummary } from '@/lib/summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Pyrometer token burn';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getProfileSummary(id);
  const line1 = s ? `${usd(s.usdTotal)} USD` : 'Unknown profile';
  const line2 = s ? `${s.totals.tokens.toLocaleString('en-US')} tokens` : '';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#ffffff', color: '#000000', fontSize: 72 }}>
        <div style={{ fontSize: 36 }}>{`Pyrometer /u/${id}`}</div>
        <div>{line1}</div>
        <div>{line2}</div>
      </div>
    ),
    size,
  );
}
