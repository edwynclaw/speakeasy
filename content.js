// SpeakEasy Content Script

class SpeakEasy {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    this.currentWordIndex = 0;
    this.words = [];
    this.highlightedElements = [];
    this.toolbar = null;
    this.settings = {
      rate: 1.0,
      voice: null,
      highlightWords: true
    };
    
    this.loadSettings();
    this.createToolbar();
    this.setupListeners();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['rate', 'voiceURI', 'highlightWords']);
      if (result.rate) this.settings.rate = result.rate;
      if (result.highlightWords !== undefined) this.settings.highlightWords = result.highlightWords;
      if (result.voiceURI) {
        const voices = this.synth.getVoices();
        this.settings.voice = voices.find(v => v.voiceURI === result.voiceURI) || null;
      }
    } catch (e) {
      console.log('SpeakEasy: Using default settings');
    }
  }

  createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'speakeasy-toolbar';
    this.toolbar.innerHTML = `
      <div class="speakeasy-controls">
        <button id="speakeasy-play" title="Play">▶</button>
        <button id="speakeasy-pause" title="Pause">⏸</button>
        <button id="speakeasy-stop" title="Stop">⏹</button>
        <input type="range" id="speakeasy-speed" min="0.5" max="3" step="0.25" value="1">
        <span id="speakeasy-speed-label">1x</span>
        <button id="speakeasy-close" title="Close">✕</button>
      </div>
    `;
    this.toolbar.style.display = 'none';
    document.body.appendChild(this.toolbar);

    // Event listeners
    this.toolbar.querySelector('#speakeasy-play').addEventListener('click', () => this.play());
    this.toolbar.querySelector('#speakeasy-pause').addEventListener('click', () => this.pause());
    this.toolbar.querySelector('#speakeasy-stop').addEventListener('click', () => this.stop());
    this.toolbar.querySelector('#speakeasy-close').addEventListener('click', () => this.hideToolbar());
    
    const speedSlider = this.toolbar.querySelector('#speakeasy-speed');
    speedSlider.addEventListener('input', (e) => {
      this.settings.rate = parseFloat(e.target.value);
      this.toolbar.querySelector('#speakeasy-speed-label').textContent = `${this.settings.rate}x`;
      chrome.storage.sync.set({ rate: this.settings.rate });
      
      // If playing, restart with new speed
      if (this.isPlaying && !this.isPaused) {
        const currentText = this.currentText;
        this.stop();
        this.speak(currentText);
      }
    });
  }

  showToolbar() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      this.toolbar.style.display = 'flex';
      this.toolbar.style.top = `${window.scrollY + rect.top - 50}px`;
      this.toolbar.style.left = `${window.scrollX + rect.left}px`;
    }
  }

  hideToolbar() {
    this.toolbar.style.display = 'none';
    this.stop();
  }

  setupListeners() {
    // Show toolbar on text selection
    document.addEventListener('mouseup', (e) => {
      if (this.toolbar.contains(e.target)) return;
      
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text.length > 0) {
        this.currentText = text;
        this.showToolbar();
      }
    });

    // Hide toolbar on click outside
    document.addEventListener('mousedown', (e) => {
      if (!this.toolbar.contains(e.target) && this.toolbar.style.display !== 'none') {
        const selection = window.getSelection();
        if (selection.toString().trim().length === 0) {
          this.hideToolbar();
        }
      }
    });

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'read':
          this.speak(message.text);
          break;
        case 'readSelection':
          const selection = window.getSelection().toString().trim();
          if (selection) {
            this.currentText = selection;
            this.showToolbar();
            this.speak(selection);
          }
          break;
        case 'getState':
          sendResponse({
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            rate: this.settings.rate
          });
          break;
        case 'control':
          if (message.command === 'play') this.play();
          if (message.command === 'pause') this.pause();
          if (message.command === 'stop') this.stop();
          if (message.command === 'setRate') {
            this.settings.rate = message.value;
            this.toolbar.querySelector('#speakeasy-speed').value = message.value;
            this.toolbar.querySelector('#speakeasy-speed-label').textContent = `${message.value}x`;
          }
          break;
      }
      return true;
    });

    // Load voices when available
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadSettings();
    }
  }

  speak(text) {
    this.stop();
    this.currentText = text;
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = this.settings.rate;
    
    if (this.settings.voice) {
      this.utterance.voice = this.settings.voice;
    }

    this.utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.updateToolbarState();
    };

    this.utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.clearHighlights();
      this.updateToolbarState();
    };

    this.utterance.onerror = (e) => {
      console.error('SpeakEasy error:', e);
      this.isPlaying = false;
      this.isPaused = false;
      this.updateToolbarState();
    };

    // Word boundary for highlighting (if supported)
    if (this.settings.highlightWords) {
      this.utterance.onboundary = (e) => {
        if (e.name === 'word') {
          this.highlightWord(e.charIndex, e.charLength);
        }
      };
    }

    this.synth.speak(this.utterance);
  }

  play() {
    if (this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
    } else if (!this.isPlaying && this.currentText) {
      this.speak(this.currentText);
    }
    this.updateToolbarState();
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      this.updateToolbarState();
    }
  }

  stop() {
    this.synth.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.clearHighlights();
    this.updateToolbarState();
  }

  updateToolbarState() {
    const playBtn = this.toolbar.querySelector('#speakeasy-play');
    const pauseBtn = this.toolbar.querySelector('#speakeasy-pause');
    
    if (this.isPlaying && !this.isPaused) {
      playBtn.style.opacity = '0.5';
      pauseBtn.style.opacity = '1';
    } else {
      playBtn.style.opacity = '1';
      pauseBtn.style.opacity = '0.5';
    }
  }

  highlightWord(charIndex, charLength) {
    // This is a simplified highlight - full implementation would need DOM traversal
    // For now, we'll rely on the selection highlight
  }

  clearHighlights() {
    this.highlightedElements.forEach(el => {
      el.style.backgroundColor = '';
    });
    this.highlightedElements = [];
  }
}

// Initialize
const speakeasy = new SpeakEasy();
