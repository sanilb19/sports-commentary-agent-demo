'use client';

import { useEffect, useRef, useState } from 'react';

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

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function HomePage() {
  const [videoUrl, setVideoUrl] = useState('');
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [queue, setQueue] = useState([]); // upcoming highlights
  const [history, setHistory] = useState([]); // all highlights fetched so far
  const [current, setCurrent] = useState(null);
  const [status, setStatus] = useState('idle');
  const [jobStatus, setJobStatus] = useState(null); 
  const [jobError, setJobError] = useState(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Waiting for video…');

  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const intervalRef = useRef(null);
  const lastCreatedAtRef = useRef(null);
  const playLockRef = useRef(false);

  // 1. Handle Job Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!videoUrl) return;

    const vid = extractVideoId(videoUrl);
    if (!vid) {
      alert('Invalid YouTube URL');
      return;
    }

    setLoadingMessage('Resetting previous data for a fresh demo…');
    setJobError(null);
    setJobStatus(null);
    setActiveJobId(null);
    setQueue([]);
    setHistory([]);
    setCurrent(null);
    setStatus('idle');
    lastCreatedAtRef.current = null;
    queueRef.current = [];
    
    try {
      // Always reset the DB for a clean demo run
      await fetch('/api/reset', {
        method: 'POST',
        body: JSON.stringify({ videoUrl }),
      });

      setLoadingMessage('Submitting job to Agent…');
      const res = await fetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ videoUrl }),
      });
      const data = await res.json();
      
      if (data.videoId) {
        setActiveVideoId(data.videoId);
        setJobStatus('pending');
        if (data.jobId) {
          setActiveJobId(data.jobId);
        } else if (data.message === 'Match already analyzed') {
          setJobStatus('completed');
        }
      }
    } catch (err) {
      console.error(err);
      setJobError('Failed to start demo.');
    }
  };

  const handleReset = async () => {
    if (!videoUrl) return;
    if (!confirm('Are you sure? This will delete all analysis and highlights for this video.')) return;
    
    setLoadingMessage('Resetting demo…');
    try {
      await fetch('/api/reset', {
        method: 'POST',
        body: JSON.stringify({ videoUrl }),
      });
      // Clear state
      setActiveVideoId(null);
      setActiveJobId(null);
      setJobStatus(null);
      setQueue([]);
      setHistory([]);
      setCurrent(null);
      setStatus('idle');
      lastCreatedAtRef.current = null;
      queueRef.current = [];
      setVideoUrl('');
      setLoadingMessage('Ready to analyze.');
    } catch (e) {
      console.error(e);
      alert('Failed to reset.');
    }
  };

  // 2. Initialize YouTube Player
  useEffect(() => {
    if (!activeVideoId) return;

    const initPlayer = () => {
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById(activeVideoId);
        return;
      }

      new window.YT.Player('player', {
        videoId: activeVideoId,
        playerVars: { autoplay: 1, mute: 1, playsinline: 1, controls: 1, rel: 0 },
        events: {
          onReady: (e) => {
            playerRef.current = e.target;
            setPlayerReady(true);
            setLoadingMessage('');
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = initPlayer;
    }
  }, [activeVideoId]);

  // 5. Poll Job Status & Highlights
  useEffect(() => {
    if (!activeVideoId) return;

    const poll = async () => {
      // Check Job Status
      if (activeJobId && jobStatus !== 'completed' && jobStatus !== 'failed') {
        try {
          const jobRes = await fetch(`/api/jobs?job_id=${activeJobId}`, { cache: 'no-store' });
          if (jobRes.ok) {
            const jobData = await jobRes.json();
            if (jobData.data) {
              setJobStatus(jobData.data.status);
              if (jobData.data.error_message) {
                setJobError(jobData.data.error_message);
              }
            }
          }
        } catch (e) {
          console.error("Failed to poll job status", e);
        }
      }

      // Check New Highlights
      try {
        const params = new URLSearchParams({ video_id: activeVideoId });
        if (lastCreatedAtRef.current) params.set('since', lastCreatedAtRef.current);
        
        const res = await fetch(`/api/highlights?${params.toString()}`, { cache: 'no-store' });
        if (res.ok) {
          const payload = await res.json();
          if (payload?.data?.length) {
            const sorted = payload.data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            lastCreatedAtRef.current = sorted[sorted.length - 1].created_at;
            queueRef.current = [...queueRef.current, ...sorted];
            setQueue([...queueRef.current]);
            setHistory(prev => [...prev, ...sorted]);
          }
        }
      } catch (e) {
        console.error("Failed to poll highlights", e);
      }
    };

    const interval = setInterval(poll, 4000);
    poll(); 
    return () => clearInterval(interval);
  }, [activeVideoId, activeJobId, jobStatus]);

  const playHighlight = (highlight) => {
    if (!playerRef.current) return;
    
    // Clear any existing playback interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    playLockRef.current = true;
    setCurrent(highlight);
    setStatus('playing');

    playerRef.current.seekTo(highlight.start_sec, true);
    playerRef.current.playVideo();

    if (audioRef.current) {
      if (highlight.audio_url) {
        audioRef.current.src = highlight.audio_url;
        audioRef.current.play().catch(() => setAudioBlocked(true));
      } else {
        audioRef.current.src = "";
      }
    }

    intervalRef.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        if (playerRef.current.getCurrentTime() >= highlight.end_sec) {
          clearInterval(intervalRef.current);
          setStatus('idle');
          playLockRef.current = false;
          setCurrent(null);
        }
      }
    }, 500);
  };

  // 6. Automatic Playback Logic
  useEffect(() => {
    if (!playerReady || status !== 'idle' || queueRef.current.length === 0 || playLockRef.current) return;
    const highlight = queueRef.current.shift();
    setQueue([...queueRef.current]);
    playHighlight(highlight);
  }, [playerReady, status, queue.length]);

  const handleHighlightClick = (item) => {
    // Optional: remove from queue if they manually clicked it to avoid double play, or just play it directly
    // For simplicity, we just play it directly, interrupting the current video
    playHighlight(item);
  };

  const steps = [
    { id: 'pending', label: 'In Queue' },
    { id: 'skimming', label: 'Skimming Match' },
    { id: 'scouting', label: 'Scouting Tactics' },
    { id: 'completed', label: 'Highlights Ready' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === jobStatus);

  return (
    <main className="container">
      <div className="header">
        <h1>⚽ Sports Commentary Agent</h1>
        <form onSubmit={handleSubmit} className="url-form">
          <input 
            type="text" 
            placeholder="Paste Tactical Match URL (YouTube)…" 
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
          <div className="button-group">
            <button type="submit" disabled={jobStatus !== null && jobStatus !== 'completed' && jobStatus !== 'failed'}>
              Analyze Match
            </button>
            <button type="button" onClick={handleReset} className="reset-btn">
              Reset Demo
            </button>
          </div>
        </form>
      </div>

      {jobStatus && (
        <div className="status-tracker">
          <div className="progress-steps">
            {steps.map((step, index) => {
              const isActive = step.id === jobStatus;
              const isPast = currentStepIndex > index || jobStatus === 'completed';
              return (
                <div key={step.id} className={`step ${isActive ? 'active' : ''} ${isPast ? 'completed' : ''}`}>
                  <div className="step-circle">{isPast ? '✓' : index + 1}</div>
                  <div className="step-label">
                    {step.label}{isActive && jobStatus !== 'completed' ? '…' : ''}
                  </div>
                </div>
              );
            })}
          </div>
          {jobError && (
            <div className="error-message">
              <strong>Error:</strong> {jobError}
            </div>
          )}
        </div>
      )}

      <div className="grid">
        <div className="video-section">
          <div className="video-container">
            <div id="player" className="video-player"></div>
          </div>
          
          {audioBlocked && (
            <div className="audio-alert">
              <button onClick={() => { 
                if(audioRef.current) audioRef.current.play(); 
                setAudioBlocked(false); 
                if(playerRef.current && playerRef.current.unMute) playerRef.current.unMute(); 
              }}>
                🔈 Click here to enable TTS Audio overlay
              </button>
            </div>
          )}
          <audio ref={audioRef} />

          {current && (
            <div className="live-commentary-banner">
              <div className="label">Live Analysis</div>
              <div className="text">{current.text}</div>
            </div>
          )}
        </div>

        <div className="sidebar">
          <h3>Tactical Highlights</h3>
          <div className="queue-list">
            {history.length === 0 && !current && (
              <p className="empty">
                {jobStatus === 'completed' ? 'No highlights found.' : 'Waiting for Agent…'}
              </p>
            )}
            
            {history.map((item, i) => {
              const isPlaying = current && current.id === item.id;
              return (
                <div 
                  key={item.id || i} 
                  className={`queue-item ${isPlaying ? 'active' : ''}`}
                  onClick={() => handleHighlightClick(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="timestamp">
                    {formatTime(item.start_sec)} - {formatTime(item.end_sec)}
                    {isPlaying && <span className="active-badge">Playing</span>}
                  </div>
                  <div className="desc">{item.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}