
import { NextRequest, NextResponse } from 'next/server';

const ORACLE_URL = (process.env.ORACLE_URL ?? 'https://supreme-space-guacamole-v665jv9q5p9v3pp74-3001.app.github.dev').replace(/\/$/, '');

// ── GET /api/attest?jobId=xxx ─────────────────────────────────
// Frontend polls this until status === 'done' or 'error'
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const res = await fetch(`${ORACLE_URL}/attest/status?jobId=${jobId}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST /api/attest ──────────────────────────────────────────
// Forwards request to oracle backend, returns jobId immediately
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Forward to oracle backend — which starts the job and returns jobId
    const res = await fetch(`${ORACLE_URL}/attest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Oracle error ${res.status}` }));
      return NextResponse.json(err, { status: res.status });
    }

    const data = await res.json();
    // data: { jobId }
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('[attest proxy] error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Proxy failed' }, { status: 500 });
  }
}