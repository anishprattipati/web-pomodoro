# Web Pomodoro (Minimal MVP)

This is a small, dependency-light React app implementing a timestamp-based Pomodoro timer.

Features:
- Focus 25m, Short break 5m, Long break 15m
- Long break after 4 focus sessions
- Timestamp-based timer (accurate when tab is inactive)
- Pause / Resume toggle
- Simple alarm using WebAudio (plays once)
- Mute / unmute toggle (alarm requires user interaction to unlock audio)

Run locally:

```bash
cd web-pomodoro
npm install
npm run dev
```

Open the dev URL (usually http://localhost:5173).

Notes:
- The app uses a small WebAudio tone rather than bundling an audio file to keep the example self-contained.
- The alarm will only play after at least one user interaction (browser autoplay policies).
 - You can drag & drop an MP3 file into the app to play it as a looping background audio track.
 - Optionally paste a YouTube URL to embed a background player (you must press play due to autoplay rules).
