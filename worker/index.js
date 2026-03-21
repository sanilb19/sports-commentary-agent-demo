import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

const DEFAULT_CONFIG = {
  highlightTarget: 5,
  windowSec: 45,
  frameEverySec: 4,
  skimFrameEverySec: 30,
  geminiModel: 'gemini-3-flash-preview',
  ttsVoice: 'en-GB-Journey-D'
};

// --- Utilities ---

async function run(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 50 * 1024 * 1024,
    ...options
  });
  return stdout.trim();
}

async function getStreamUrl(videoUrl) {
  const output = await run('yt-dlp', ['-g', '-f', 'best[height<=720]', videoUrl]);
  const lines = output.split('\n').filter(Boolean);
  return lines[0];
}

async function getDurationSeconds(videoUrl) {
  const output = await run('yt-dlp', ['--print', 'duration', videoUrl]);
  const duration = Number(output.trim());
  if (Number.isNaN(duration)) throw new Error('Unable to parse video duration.');
  return duration;
}

async function getVideoTitle(videoUrl) {
  try {
    const title = await run('yt-dlp', ['--print', 'title', videoUrl]);
    return title || 'Unknown Match';
  } catch (err) {
    console.warn('[Agent] Could not fetch video title', err.message);
    return 'Unknown Match';
  }
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return null;
  }
}

// --- Agent Phases ---

/**
 * Phase 1: The Director (Skim Pass)
 * Extracts 1 frame every 60 seconds to find Hot Zones.
 */
async function skimMatch({ ai, streamUrl, duration, skimFrameEverySec, title }) {
  console.log(`[Director] Skimming match (${Math.round(duration / 60)} mins) at 1 frame every ${skimFrameEverySec}s...`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skim-'));
  const outputPattern = path.join(tempDir, 'skim_%03d.jpg');

  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', streamUrl,
    '-vf', `fps=1/${skimFrameEverySec},scale=640:-1`,
    '-q:v', '5',
    outputPattern
  ]);

  const files = (await fs.readdir(tempDir)).filter(f => f.endsWith('.jpg')).sort();
  const images = [];
  for (const file of files) {
    images.push((await fs.readFile(path.join(tempDir, file))).toString('base64'));
  }
  await fs.rm(tempDir, { recursive: true, force: true });

  const prompt = `You are a world-class soccer director analyzing a match.
Match Title / Teams: "${title}"
I am providing frames extracted every ${skimFrameEverySec} seconds from a full soccer match.
Identify the 8 most tactically significant "Hot Zones" (start seconds).
CRITICAL INSTRUCTION: Identifying goals is your absolute highest priority. You MUST find and include all goals, near misses, red cards, and major tactical shifts. Do not miss any goals!
Return ONLY strict JSON: { "hotZones": [ { "startSec": number, "reason": "string", "intensity": 1-10 } ] }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }))] }]
  });

  console.log('[Director] Raw response:', response.text);
  const parsed = extractJson(response.text);
  console.log('[Director] Parsed JSON:', parsed);
  return parsed?.hotZones?.sort((a, b) => b.intensity - a.intensity) || [];
}

/**
 * Phase 2: The Tactician (Scout Pass)
 * Analyzes a specific window in detail.
 */
async function scoutWindow({ ai, streamUrl, startSec, windowSec, frameEverySec, title }) {
  console.log(`[Tactician] Scouting window at ${startSec}s...`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-'));
  const outputPattern = path.join(tempDir, 'frame_%02d.jpg');

  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(startSec),
    '-i', streamUrl,
    '-t', String(windowSec),
    '-vf', `fps=1/${frameEverySec}`,
    '-q:v', '3',
    outputPattern
  ]);

  const files = (await fs.readdir(tempDir)).filter(f => f.endsWith('.jpg')).sort();
  const images = [];
  for (const file of files) {
    images.push((await fs.readFile(path.join(tempDir, file))).toString('base64'));
  }
  await fs.rm(tempDir, { recursive: true, force: true });

  const prompt = `You are a legendary, passionate British sports commentator calling a match.
Match Title / Teams: "${title}"
Analyze these frames from the match. You MUST find the absolute best highlight in this window.
IMPORTANT: The clip duration (endOffsetSec - startOffsetSec) MUST be at least 15 to 25 seconds long to provide the full build-up, the action, and the celebration/reaction. Do NOT make the clip too short!
For the commentary, act like a true experienced sports commentator. Be energetic, use play-by-play style phrasing, and sound passionate! Use the team names from the Match Title if possible. Max 30 words.
Return ONLY strict JSON: { "interestScore": 0-10, "startOffsetSec": number, "endOffsetSec": number, "commentary": "passionate commentator script" }`;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }))] }]
  });

  console.log(`[Tactician] Raw response at ${startSec}s:`, response.text);
  const parsed = extractJson(response.text);
  console.log(`[Tactician] Parsed JSON at ${startSec}s:`, parsed);
  return parsed;
}

/**
 * Phase 3: The Producer (TTS & Upload)
 */
async function synthesizeSpeech({ apiKey, text, voice }) {
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: voice.substring(0, 5), name: voice },
      audioConfig: { audioEncoding: 'MP3' }
    })
  });
  
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`TTS API failed (${response.status}): ${message}`);
  }
  
  const payload = await response.json();
  if (!payload.audioContent) {
    throw new Error('TTS API returned successful response but no audioContent.');
  }
  return payload.audioContent;
}

// --- Main Loop ---

async function notify(message) {
  try {
    await fetch('https://ntfy.sh/gemini-sports-agent-2026-sb', {
      method: 'POST',
      body: message
    });
  } catch (e) {
    console.error('Notification failed', e);
  }
}

async function processJob(job, supabase, ai, config) {
  const { id, video_url, video_id } = job;
  console.log(`[Agent] Starting job ${id} for ${video_url}`);
  await notify(`⚽ Starting analysis for: ${video_url}`);

  try {
    await supabase.from('jobs').update({ status: 'skimming' }).eq('id', id);

    const streamUrl = await getStreamUrl(video_url);
    const duration = await getDurationSeconds(video_url);
    const title = await getVideoTitle(video_url);

    // Phase 1: Skim
    const hotZones = await skimMatch({ ai, streamUrl, duration, skimFrameEverySec: config.skimFrameEverySec, title });
    
    // Create/Update Match Entry
    await supabase.from('matches').upsert({
      video_id,
      video_url,
      title,
      duration_sec: duration,
      status: 'analyzed'
    });

    await supabase.from('jobs').update({ status: 'scouting' }).eq('id', id);

    // Phase 2 & 3: Scout & Synthesize
    const highlights = [];
    for (const zone of hotZones.slice(0, config.highlightTarget)) {
      const analysis = await scoutWindow({
        ai, streamUrl, startSec: zone.startSec, windowSec: config.windowSec, frameEverySec: config.frameEverySec, title
      });

      if (analysis && analysis.interestScore > 0) {
        let finalAudioUrl = "";
        try {
          const audioContent = await synthesizeSpeech({
            apiKey: process.env.TTS_API_KEY,
            text: analysis.commentary,
            voice: config.ttsVoice
          });

          const fileName = `${video_id}/${zone.startSec}-${crypto.randomUUID()}.mp3`;
          await supabase.storage.from(process.env.SUPABASE_BUCKET || 'commentary').upload(fileName, Buffer.from(audioContent, 'base64'), { contentType: 'audio/mpeg' });
          
          const { data: publicUrl } = supabase.storage.from(process.env.SUPABASE_BUCKET || 'commentary').getPublicUrl(fileName);
          finalAudioUrl = publicUrl.publicUrl;
        } catch (ttsErr) {
          console.warn(`[Agent] TTS/Upload skipped for highlight at ${zone.startSec}s: ${ttsErr.message}`);
        }

        const { error: insertErr } = await supabase.from('highlights').insert({
          video_id,
          start_sec: zone.startSec + (analysis.startOffsetSec || 0),
          end_sec: zone.startSec + (analysis.endOffsetSec || config.windowSec),
          text: analysis.commentary,
          audio_url: finalAudioUrl
        });
        if (insertErr) {
          console.error(`[Agent] Failed to insert highlight:`, insertErr);
        }
      }
    }

    await supabase.from('jobs').update({ status: 'completed' }).eq('id', id);
    console.log(`[Agent] Job ${id} completed successfully.`);
    await notify(`✅ Match Analysis Complete! Highlights are ready for ${video_id}`);

  } catch (err) {
    console.error(`[Agent] Job ${id} failed:`, err);
    await supabase.from('jobs').update({ status: 'failed', error_message: err.message }).eq('id', id);
    await notify(`❌ Job Failed: ${err.message}`);
  }
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log('[Agent] Worker started. Polling for jobs...');

  while (true) {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'pending')
      .limit(1);

    if (jobs && jobs.length > 0) {
      await processJob(jobs[0], supabase, ai, DEFAULT_CONFIG);
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
  }
}

main().catch(console.error);
