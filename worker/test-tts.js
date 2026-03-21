import 'dotenv/config';

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

synthesizeSpeech({
  apiKey: process.env.TTS_API_KEY,
  text: "And what a spectacular goal that is! Absolutely brilliant strike!",
  voice: "en-GB-Journey-D"
}).then(() => console.log("TTS SUCCESS"))
  .catch(e => console.error("TTS FAILED:", e.message));
