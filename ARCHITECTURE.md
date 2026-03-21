# Sports Commentary Agent: Architecture & Goals

## 🎯 Project Goal
To build a "True Agent" that autonomously analyzes full-length soccer matches (tactical view), identifies key tactical narratives, and generates high-quality highlight clips with AI-driven tactical commentary and TTS.

## 🏗️ Three-Tier Architecture

### 1. Frontend (The Dashboard)
- **Framework:** Next.js (App Router)
- **Deployment:** **Vercel**
- **Responsibility:** User interface for inputting video URLs, real-time status updates via Supabase, and a video player for the final highlight reel.

### 2. Backend (The Brain/State)
- **Provider:** **Supabase**
- **Database:** Stores `jobs` (queue), `highlights` (metadata), and `matches` (overall stats).
- **Storage:** Stores generated TTS MP3 files and potentially processed frames or clips.
- **Realtime:** Enables the Frontend to "listen" for when the Agent finishes a task.

### 3. Worker (The Agent Engine)
- **Runtime:** Node.js
- **Deployment:** **Modal.com** (recommended) or **Railway/Render** (Background Worker).
- **Responsibility:** The heavy-lifting "Agentic" loop:
    - **Skim Pass:** Extract 1 frame/min, identify "Hot Zones" via Gemini 1.5 Flash.
    - **Scout Pass:** Zoom into Hot Zones at 1 frame/sec for deep tactical analysis.
    - **Commentary Pass:** Synthesize tactical insights into vivid, natural commentary.
    - **TTS & Upload:** Convert text to speech and sync everything back to Supabase.

## 🔄 Agentic Workflow (Skim -> Scout -> Synthesize)
Unlike a simple pipeline, this system uses a hierarchical reasoning approach:
1. **Observation:** Skims the entire 90-minute match to find the "story" (Goals, Red Cards, Tactical Shifts).
2. **Selection:** Chooses the top 5-10 moments that represent the match narrative.
3. **Deep Analysis:** Performs high-resolution frame analysis only on the selected moments.
4. **Self-Critique:** (Optional) Evaluates if the commentary matches the visual action before finalizing.

## 🚀 Deployment Strategy
- **Frontend:** Vercel (Fast, global, easy UI deploys).
- **Worker:** Modal (Serverless for AI, handles `ffmpeg` and long-running tasks without timeouts).
- **Database:** Supabase (Reliable, scales easily, provides auth and storage).
