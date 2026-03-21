import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase server credentials.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '');
    }
    const v = parsed.searchParams.get('v');
    if (v) return v;
  } catch (err) {
    return null;
  }
  return null;
}

export async function POST(request) {
  try {
    const { videoUrl } = await request.json();
    if (!videoUrl) {
      return NextResponse.json({ error: 'Missing videoUrl' }, { status: 400 });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const supabase = getClient();

    await supabase.from('matches').delete().eq('video_id', videoId);
    await supabase.from('jobs').delete().eq('video_id', videoId);
    await supabase.from('highlights').delete().eq('video_id', videoId);

    return NextResponse.json({ message: 'Reset successful' }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
