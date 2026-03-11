import { NextRequest, NextResponse } from 'next/server';

const ORACLE_URL = process.env.ORACLE_URL ?? 'https://supreme-space-guacamole-v665jv9q5p9v3pp74-3001.app.github.dev';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const oracleRes = await fetch(`${ORACLE_URL}/attest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    console.log(oracleRes, 'oracle response');
    const data = await oracleRes.json();

    if (!oracleRes.ok) {
      return NextResponse.json(data, { status: oracleRes.status });
    }

    return NextResponse.json(data);

  } catch (err: any) {
    console.error('[attest proxy] error:', err);

    // If oracle server is not running, give a helpful message
    if (err?.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'Oracle server is not running. Start it with: node oracle-server.mjs' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: err?.message ?? 'Proxy error' },
      { status: 500 }
    );
  }
}