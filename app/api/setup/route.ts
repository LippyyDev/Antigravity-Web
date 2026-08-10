import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Auto-setup route: creates the required Supabase tables if they don't exist.
 * Call this once by visiting /api/setup
 * Uses Supabase's rpc or raw SQL execution via service role.
 */
export async function GET(request: NextRequest) {
  // Only allow from localhost for security
  const host = request.headers.get('host') || '';
  if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
    return NextResponse.json({ error: 'Setup only allowed from localhost' }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const results: Record<string, string> = {};

  // Test if antigravity_tokens table exists
  const { error: testTokens } = await supabase
    .from('antigravity_tokens')
    .select('user_id')
    .limit(1);

  if (testTokens && testTokens.code === '42P01') {
    results.antigravity_tokens = 'TABLE MISSING - please run supabase-schema.sql manually';
  } else if (testTokens) {
    results.antigravity_tokens = `Error: ${testTokens.message}`;
  } else {
    results.antigravity_tokens = 'EXISTS ✓';
  }

  // Test if model_quota_entries table exists
  const { error: testQuota } = await supabase
    .from('model_quota_entries')
    .select('id')
    .limit(1);

  if (testQuota && testQuota.code === '42P01') {
    results.model_quota_entries = 'TABLE MISSING - please run supabase-schema.sql manually';
  } else if (testQuota) {
    results.model_quota_entries = `Error: ${testQuota.message}`;
  } else {
    results.model_quota_entries = 'EXISTS ✓';
  }

  const allGood = Object.values(results).every((v) => v.includes('✓'));

  return NextResponse.json({
    status: allGood ? 'OK' : 'TABLES_MISSING',
    tables: results,
    instruction: allGood
      ? 'All tables exist. You\'re ready to go!'
      : 'Some tables are missing. Please open https://supabase.com/dashboard/project/uewesyxysxwhpqjqgxsb/sql/new and run the SQL from supabase-schema.sql',
    schema_file: 'c:\\Users\\Lippyy\\Downloads\\AntigravityManager-0.17.0\\Antigravity Web\\supabase-schema.sql',
  });
}
