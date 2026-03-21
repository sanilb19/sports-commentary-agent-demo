import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reset() {
  const videoId = 'Rfylh5wwReI';
  
  // Delete the match
  await supabase.from('matches').delete().eq('video_id', videoId);
  console.log('Match deleted.');

  // Delete the jobs
  await supabase.from('jobs').delete().eq('video_id', videoId);
  console.log('Jobs deleted.');

  // Delete the highlights
  await supabase.from('highlights').delete().eq('video_id', videoId);
  console.log('Highlights deleted.');
}

reset();
