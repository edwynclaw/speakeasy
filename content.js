// SpeakEasy Content Script - With timer fallback for highlighting

class SpeakEasy {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    this.words = [];
    this.currentWordIndex = 0;
    this.toolbar = null;
    this.wordDisplay = null;
    this.wordTimer = null;
    this.boundaryFired = false;
    this.settings = {
      rate: 1.0,
      voice: null,
      voiceURI: null,
      highlightWords: true
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createToolbar();
    this.setupListeners();
    
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.applyVoice();
    }
    setTimeout(() => this.applyVoice(), 100);
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['rate', 'voiceURI', 'highlightWords']);
      if (result.rate) this.settings.rate = result.rate;
      if (result.highlightWords !== undefined) this.settings.highlightWords = result.highlightWords;
      if (result.voiceURI) this.settings.voiceURI = result.voiceURI;
    } catch (e) {
      console.log('SpeakEasy: Using default settings');
    }
  }

  applyVoice() {
    if (this.settings.voiceURI) {
      const voices = this.synth.getVoices();
      this.settings.voice = voices.find(v => v.voiceURI === this.settings.voiceURI) || null;
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
        <input type="range" id="speakeasy-speed" min="0.5" max="3" step="0.25" value="${this.settings.rate}">
        <span id="speakeasy-speed-label">${this.settings.rate}x</span>
        <button id="speakeasy-close" title="Close">✕</button>
      </div>
      <div class="speakeasy-progress-bar"><div class="speakeasy-progress-fill"></div></div>
      <div class="speakeasy-word-display"></div>
    `;
    this.toolbar.style.display = 'none';
    document.body.appendChild(this.toolbar);

    this.wordDisplay = this.toolbar.querySelector('.speakeasy-word-display');

    this.toolbar.querySelector('#speakeasy-play').addEventListener('click', () => this.play());
    this.toolbar.querySelector('#speakeasy-pause').addEventListener('click', () => this.pause());
    this.toolbar.querySelector('#speakeasy-stop').addEventListener('click', () => this.stop());
    this.toolbar.querySelector('#speakeasy-close').addEventListener('click', () => this.hideToolbar());
    
    const speedSlider = this.toolbar.querySelector('#speakeasy-speed');
    speedSlider.addEventListener('input', (e) => {
      this.settings.rate = parseFloat(e.target.value);
      this.toolbar.querySelector('#speakeasy-speed-label').textContent = `${this.settings.rate}x`;
      chrome.storage.sync.set({ rate: this.settings.rate });
    });
  }

  showToolbar(rect) {
    this.toolbar.style.display = 'block';
    
    let top = window.scrollY + rect.top - 110;
    let left = window.scrollX + rect.left;
    
    if (top < window.scrollY + 10) {
      top = window.scrollY + rect.bottom + 10;
    }
    if (left < 10) left = 10;
    if (left + 280 > window.innerWidth) {
      left = window.innerWidth - 290;
    }
    
    this.toolbar.style.top = `${top}px`;
    this.toolbar.style.left = `${left}px`;
  }

  hideToolbar() {
    this.toolbar.style.display = 'none';
    this.stop();
  }

  setupListeners() {
    document.addEventListener('mouseup', (e) => {
      if (this.toolbar.contains(e.target)) return;
      
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        if (text.length > 0 && selection.rangeCount > 0) {
          this.currentText = text;
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          this.showToolbar(rect);
        }
      }, 10);
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.toolbar.contains(e.target) && this.toolbar.style.display !== 'none') {
        if (!this.isPlaying) {
          this.hideToolbar();
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.voiceURI) {
          this.settings.voiceURI = changes.voiceURI.newValue;
          this.applyVoice();
        }
        if (changes.rate) {
          this.settings.rate = changes.rate.newValue;
          this.toolbar.querySelector('#speakeasy-speed').value = this.settings.rate;
          this.toolbar.querySelector('#speakeasy-speed-label').textContent = `${this.settings.rate}x`;
        }
        if (changes.highlightWords !== undefined) {
          this.settings.highlightWords = changes.highlightWords.newValue;
        }
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'read':
          this.currentText = message.text;
          this.speak();
          break;
        case 'readSelection':
          const selection = window.getSelection();
          const text = selection.toString().trim();
          if (text) {
            this.currentText = text;
            const range = selection.getRangeAt(0);
            this.showToolbar(range.getBoundingClientRect());
            this.speak();
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
          break;
      }
      return true;
    });
  }

  speak() {
    this.applyVoice();
    this.synth.cancel();
    this.stopWordTimer();
    
    this.currentWordIndex = 0;
    this.boundaryFired = false;
    
    // Parse words
    this.words = this.currentText.match(/\S+/g) || [];
    if (this.words.length === 0) return;
    
    this.utterance = new SpeechSynthesisUtterance(this.currentText);
    this.utterance.rate = this.settings.rate;
    
    if (this.settings.voice) {
      this.utterance.voice = this.settings.voice;
    }

    this.utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.updateToolbarState();
      this.showCurrentWord(0);
      
      // Start timer fallback after a short delay
      // If onboundary fires, we'll use that instead
      setTimeout(() => {
        if (!this.boundaryFired && this.isPlaying) {
          this.startWordTimer();
        }
      }, 300);
    };

    this.utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.stopWordTimer();
      this.clearHighlights();
      this.updateToolbarState();
    };

    this.utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.error('SpeakEasy error:', e);
      }
      this.isPlaying = false;
      this.isPaused = false;
      this.stopWordTimer();
      this.clearHighlights();
      this.updateToolbarState();
    };

    // Word boundary - use if browser supports it
    this.utterance.onboundary = (e) => {
      if (e.name === 'word') {
        this.boundaryFired = true;
        this.stopWordTimer(); // Use boundary events instead of timer
        
        // Find word index from char position
        let charCount = 0;
        for (let i = 0; i < this.words.length; i++) {
          const wordPos = this.currentText.indexOf(this.words[i], charCount);
          if (e.charIndex <= wordPos + this.words[i].length) {
            this.currentWordIndex = i;
            this.showCurrentWord(i);
            break;
          }
          charCount = wordPos + this.words[i].length;
        }
      }
    };

    this.synth.speak(this.utterance);
  }

  // Timer-based fallback for voices that don't support onboundary
  startWordTimer() {
    if (this.wordTimer) return;
    
    const advanceWord = () => {
      if (!this.isPlaying || this.isPaused) return;
      
      this.currentWordIndex++;
      if (this.currentWordIndex < this.words.length) {
        this.showCurrentWord(this.currentWordIndex);
        
        // Calculate delay for next word based on word length and speech rate
        const word = this.words[this.currentWordIndex];
        const baseTime = 200; // Base ms per word
        const charTime = 40; // Additional ms per character
        const delay = (baseTime + (word.length * charTime)) / this.settings.rate;
        
        this.wordTimer = setTimeout(advanceWord, delay);
      }
    };
    
    // Start with first word timing
    const firstWord = this.words[0] || '';
    const baseTime = 200;
    const charTime = 40;
    const delay = (baseTime + (firstWord.length * charTime)) / this.settings.rate;
    
    this.wordTimer = setTimeout(advanceWord, delay);
  }

  stopWordTimer() {
    if (this.wordTimer) {
      clearTimeout(this.wordTimer);
      this.wordTimer = null;
    }
  }

  showCurrentWord(index) {
    if (index >= this.words.length) return;
    
    // Don't show if highlighting is disabled
    if (!this.settings.highlightWords) {
      this.wordDisplay.classList.remove('active');
      // Still update progress bar
      const progress = ((index + 1) / this.words.length) * 100;
      this.updateProgress(progress);
      return;
    }
    
    const word = this.words[index];
    const prev = index > 0 ? this.words[index - 1] : '';
    const next = index < this.words.length - 1 ? this.words[index + 1] : '';
    
    this.wordDisplay.innerHTML = `
      <span class="speakeasy-word-prev">${prev}</span>
      <span class="speakeasy-word-current">${word}</span>
      <span class="speakeasy-word-next">${next}</span>
      <button class="speakeasy-word-close" title="Hide word display">✕</button>
    `;
    this.wordDisplay.classList.add('active');
    
    // Add close button listener
    const closeBtn = this.wordDisplay.querySelector('.speakeasy-word-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.settings.highlightWords = false;
        chrome.storage.sync.set({ highlightWords: false });
        this.wordDisplay.classList.remove('active');
        this.wordDisplay.innerHTML = '';
      });
    }
    
    // Update progress
    const progress = ((index + 1) / this.words.length) * 100;
    this.updateProgress(progress);
  }

  updateProgress(percent) {
    const fill = this.toolbar.querySelector('.speakeasy-progress-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  }

  clearHighlights() {
    this.wordDisplay.innerHTML = '';
    this.wordDisplay.classList.remove('active');
    this.updateProgress(0);
  }

  play() {
    if (this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
      // Resume timer if we were using it
      if (!this.boundaryFired) {
        this.startWordTimer();
      }
    } else if (!this.isPlaying && this.currentText) {
      this.speak();
    }
    this.updateToolbarState();
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      this.stopWordTimer();
      this.updateToolbarState();
    }
  }

  stop() {
    this.synth.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.stopWordTimer();
    this.clearHighlights();
    this.updateToolbarState();
  }

  updateToolbarState() {
    const playBtn = this.toolbar.querySelector('#speakeasy-play');
    const pauseBtn = this.toolbar.querySelector('#speakeasy-pause');
    
    playBtn.classList.toggle('active', this.isPlaying && !this.isPaused);
    pauseBtn.classList.toggle('active', this.isPaused);
  }
}

// Initialize
const speakeasy = new SpeakEasy();
