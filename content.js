// SpeakEasy Content Script - Enhanced with word highlighting

class SpeakEasy {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    this.words = [];
    this.wordSpans = [];
    this.currentWordIndex = 0;
    this.highlightOverlay = null;
    this.originalRange = null;
    this.toolbar = null;
    this.settings = {
      rate: 1.0,
      voice: null,
      highlightWords: true
    };
    
    this.loadSettings();
    this.createToolbar();
    this.createHighlightOverlay();
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

  createHighlightOverlay() {
    // Create overlay container for word highlights
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.id = 'speakeasy-highlight-overlay';
    this.highlightOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483646;
    `;
    document.body.appendChild(this.highlightOverlay);
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
      
      // Store the range for highlighting
      this.originalRange = range.cloneRange();
      
      this.toolbar.style.display = 'flex';
      this.toolbar.style.top = `${window.scrollY + rect.top - 50}px`;
      this.toolbar.style.left = `${window.scrollX + rect.left}px`;
      
      // Keep toolbar in viewport
      const toolbarRect = this.toolbar.getBoundingClientRect();
      if (toolbarRect.left < 10) {
        this.toolbar.style.left = '10px';
      }
      if (toolbarRect.right > window.innerWidth - 10) {
        this.toolbar.style.left = `${window.innerWidth - toolbarRect.width - 10}px`;
      }
      if (toolbarRect.top < 10) {
        this.toolbar.style.top = `${window.scrollY + rect.bottom + 10}px`;
      }
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
    
    // Handle scroll to update highlight positions
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => this.updateHighlightPositions(), 50);
    }, { passive: true });
  }

  speak(text) {
    this.stop();
    this.currentText = text;
    
    // Parse words with their positions
    this.words = [];
    let pos = 0;
    const wordRegex = /\S+/g;
    let match;
    while ((match = wordRegex.exec(text)) !== null) {
      this.words.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }
    this.currentWordIndex = 0;
    
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
      if (e.error !== 'canceled') {
        console.error('SpeakEasy error:', e);
      }
      this.isPlaying = false;
      this.isPaused = false;
      this.clearHighlights();
      this.updateToolbarState();
    };

    // Word boundary for highlighting
    if (this.settings.highlightWords) {
      this.utterance.onboundary = (e) => {
        if (e.name === 'word') {
          this.highlightCurrentWord(e.charIndex);
        }
      };
    }

    this.synth.speak(this.utterance);
  }

  highlightCurrentWord(charIndex) {
    if (!this.settings.highlightWords) return;
    
    // Find which word we're on based on character index
    const wordInfo = this.words.find(w => charIndex >= w.start && charIndex < w.end);
    if (!wordInfo) {
      // Fallback: find closest word
      for (let i = 0; i < this.words.length; i++) {
        if (this.words[i].start >= charIndex) {
          this.currentWordIndex = i;
          break;
        }
      }
    } else {
      this.currentWordIndex = this.words.indexOf(wordInfo);
    }
    
    // Create floating highlight box
    this.showWordHighlight();
  }
  
  showWordHighlight() {
    this.clearHighlights();
    
    if (this.currentWordIndex >= this.words.length) return;
    
    const wordInfo = this.words[this.currentWordIndex];
    
    // Create highlight element
    const highlight = document.createElement('div');
    highlight.className = 'speakeasy-word-highlight';
    highlight.textContent = wordInfo.word;
    highlight.style.cssText = `
      position: fixed;
      background: #e94560;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 18px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
      z-index: 2147483647;
      pointer-events: none;
      animation: speakeasy-pulse 0.3s ease-out;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    `;
    
    // Position near toolbar if visible
    if (this.toolbar.style.display !== 'none') {
      const toolbarRect = this.toolbar.getBoundingClientRect();
      highlight.style.top = `${toolbarRect.bottom + 20}px`;
      highlight.style.left = `${toolbarRect.left + toolbarRect.width / 2}px`;
    }
    
    this.highlightOverlay.appendChild(highlight);
    this.wordSpans = [highlight];
    
    // Also show progress indicator
    this.updateProgressIndicator();
  }
  
  updateProgressIndicator() {
    // Remove existing progress
    const existing = this.toolbar.querySelector('.speakeasy-progress');
    if (existing) existing.remove();
    
    const progress = document.createElement('div');
    progress.className = 'speakeasy-progress';
    progress.style.cssText = `
      position: absolute;
      bottom: -4px;
      left: 0;
      height: 3px;
      background: #e94560;
      border-radius: 2px;
      transition: width 0.1s ease;
    `;
    
    const percent = (this.currentWordIndex / this.words.length) * 100;
    progress.style.width = `${percent}%`;
    
    this.toolbar.appendChild(progress);
  }
  
  updateHighlightPositions() {
    // Called on scroll - update floating highlight position if needed
    if (this.wordSpans.length > 0 && this.toolbar.style.display !== 'none') {
      const toolbarRect = this.toolbar.getBoundingClientRect();
      this.wordSpans.forEach(span => {
        span.style.top = `${toolbarRect.bottom + 20}px`;
        span.style.left = `${toolbarRect.left + toolbarRect.width / 2}px`;
      });
    }
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

  clearHighlights() {
    this.wordSpans.forEach(span => span.remove());
    this.wordSpans = [];
    
    const progress = this.toolbar.querySelector('.speakeasy-progress');
    if (progress) progress.remove();
  }
}

// Initialize
const speakeasy = new SpeakEasy();
