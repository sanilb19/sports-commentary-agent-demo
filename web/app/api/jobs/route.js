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

    // 1. Check if match already analyzed
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('video_id', videoId)
      .single();

    if (existingMatch && existingMatch.status === 'analyzed') {
      return NextResponse.json({ message: 'Match already analyzed', videoId }, { status: 200 });
    }

    // 1.5 Check if there's already an active job for this video
    const { data: activeJob } = await supabase
      .from('jobs')
      .select('*')
      .eq('video_id', videoId)
      .in('status', ['pending', 'skimming', 'scouting'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activeJob) {
      return NextResponse.json({ message: 'Job already in progress', jobId: activeJob.id, videoId }, { status: 200 });
    }

    // 2. Create a new job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        video_id: videoId,
        video_url: videoUrl,
        status: 'pending'
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Job created', jobId: job.id, videoId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing job_id' }, { status: 400 });
    }

    const supabase = getClient();
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: job }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
