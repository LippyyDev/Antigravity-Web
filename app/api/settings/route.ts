import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';


// GET /api/settings?ownerUid=xxx
export async function GET(request: NextRequest) {
  const ownerUid = request.nextUrl.searchParams.get('ownerUid');
  if (!ownerUid) return NextResponse.json({ error: 'ownerUid required' }, { status: 400 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('owner_uid', ownerUid)
    .single();

  if (error && error.code === 'PGRST116') {
    // No settings yet — return defaults
    return NextResponse.json({ owner_uid: ownerUid, exists: false });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT /api/settings
export async function PUT(request: NextRequest) {
  const body = await request.json() as Record<string, unknown> & { ownerUid?: string };
  const { ownerUid, ...settings } = body;

  if (!ownerUid) return NextResponse.json({ error: 'ownerUid required' }, { status: 400 });

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { owner_uid: ownerUid, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'owner_uid' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
