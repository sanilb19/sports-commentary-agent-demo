import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bvtssbeasaikustosmph.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const videoUrl = 'https://www.youtube.com/watch?v=Rfylh5wwReI';
const videoId = 'Rfylh5wwReI';

async function test() {
  console.log('--- E2E Validation Test ---');

  console.log('Resetting old test data...');
  await supabase.from('matches').delete().eq('video_id', videoId);
  await supabase.from('jobs').delete().eq('video_id', videoId);
  await supabase.from('highlights').delete().eq('video_id', videoId);

  console.log(`Submitting job for: ${videoUrl}`);

  // 1. Submit the job directly to Supabase
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
    console.error('Failed to create job:', jobError);
    process.exit(1);
  }

  const jobId = job.id;
  console.log(`Created Job ID: ${jobId}`);

  // 2. Poll status
  let lastStatus = 'pending';
  while (true) {
    const { data: currentJob, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      console.error('Error polling job:', error);
      process.exit(1);
    }

    if (currentJob.status !== lastStatus) {
      console.log(`Status changed: ${lastStatus} -> ${currentJob.status}`);
      lastStatus = currentJob.status;
    }

    if (currentJob.status === 'completed') {
      console.log('✅ Job completed successfully!');
      
      const { data: highlights } = await supabase
        .from('highlights')
        .select('*')
        .eq('video_id', videoId);
        
      console.log(`Found ${highlights?.length || 0} highlights:`);
      let allAudioPresent = true;
      highlights?.forEach(h => {
        console.log(`- ${h.start_sec}s to ${h.end_sec}s: ${h.text} (Audio: ${h.audio_url ? 'Yes' : 'No'})`);
        if (!h.audio_url) {
          allAudioPresent = false;
        }
      });

      if (!allAudioPresent) {
        console.error('❌ E2E Test Failed: One or more highlights were missing an audio URL.');
        process.exit(1);
      }
      
      console.log('✅ E2E Test Passed: All highlights have audio URLs.');
      process.exit(0);
    } else if (currentJob.status === 'failed') {
      console.error('❌ Job failed!');
      console.error('Error message:', currentJob.error_message);
      process.exit(1);
    }

    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

test().catch(console.error);