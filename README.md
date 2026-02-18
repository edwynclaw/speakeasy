# 🔊 SpeakEasy

A free, open-source text-to-speech browser extension. Select any text on a webpage and hear it read aloud.

**Zero API costs** — uses your browser's built-in Web Speech API.

## Features

- ✅ **Select & Read** — Highlight text, click play
- ✅ **Floating Toolbar** — Appears on text selection
- ✅ **Context Menu** — Right-click → "Read with SpeakEasy"
- ✅ **Keyboard Shortcut** — `Ctrl+Shift+R` (Mac: `Cmd+Shift+R`)
- ✅ **Speed Control** — 0.5x to 3x
- ✅ **Voice Selection** — Choose from system voices
- ✅ **Settings Sync** — Preferences saved across devices

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository
2. Open `chrome://extensions/` (or equivalent)
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `speakeasy` folder

### Firefox (coming soon)

Firefox support requires manifest modifications. Stay tuned.

## Usage

1. **Select text** on any webpage
2. A floating toolbar appears with play controls
3. Click **▶** to start reading
4. Adjust speed with the slider
5. Use **⏸** to pause, **⏹** to stop

### Keyboard Shortcut

- **Windows/Linux:** `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

### Right-Click Menu

Select text → Right-click → **Read with SpeakEasy**

## Settings

Click the extension icon to access:

- **Speed** — Playback rate (0.5x - 3x)
- **Voice** — Choose from available system voices
- **Highlight words** — Visual feedback as words are read

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Chrome Extension Manifest V3
- Web Speech API (SpeechSynthesis)
- CSS with dark theme

## Privacy

SpeakEasy runs entirely locally. No data is sent to any server. Your text stays on your device.

## License

MIT License — free to use, modify, and distribute.

## Roadmap

- [ ] Firefox support
- [ ] PDF reading
- [ ] Word-by-word highlighting (enhanced)
- [ ] Offline voice downloads
- [ ] Multiple language support
- [ ] Dyslexia-friendly mode

---

Built with ❤️ as a free alternative to paid TTS services.
