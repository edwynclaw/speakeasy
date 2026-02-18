// SpeakEasy Content Script - Enhanced with inline word highlighting

class SpeakEasy {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    this.words = [];
    this.wordElements = [];
    this.currentWordIndex = 0;
    this.selectionContainer = null;
    this.originalContent = null;
    this.originalParent = null;
    this.toolbar = null;
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
    
    // Wait for voices to load, then reload settings
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.applyVoice();
    }
    // Also try immediately (voices might already be loaded)
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
    });
  }

  showToolbar(rect) {
    this.toolbar.style.display = 'block';
    
    // Position above selection
    let top = window.scrollY + rect.top - 60;
    let left = window.scrollX + rect.left;
    
    // Keep in viewport
    if (top < window.scrollY + 10) {
      top = window.scrollY + rect.bottom + 10;
    }
    if (left < 10) left = 10;
    if (left + 300 > window.innerWidth) {
      left = window.innerWidth - 310;
    }
    
    this.toolbar.style.top = `${top}px`;
    this.toolbar.style.left = `${left}px`;
  }

  hideToolbar() {
    this.toolbar.style.display = 'none';
    this.stop();
  }

  setupListeners() {
    // Show toolbar on text selection
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
          
          // Store selection info for highlighting
          this.captureSelection(selection);
        }
      }, 10);
    });

    // Hide toolbar on click outside
    document.addEventListener('mousedown', (e) => {
      if (!this.toolbar.contains(e.target) && this.toolbar.style.display !== 'none') {
        if (!this.isPlaying) {
          this.hideToolbar();
        }
      }
    });

    // Listen for storage changes (voice/settings changes from popup)
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

    // Listen for messages from background/popup
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
            this.captureSelection(selection);
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

  captureSelection(selection) {
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    
    // Create a container to hold the wrapped content
    this.selectionContainer = document.createElement('span');
    this.selectionContainer.className = 'speakeasy-reading-container';
    
    try {
      // Extract the selected content
      const fragment = range.extractContents();
      
      // Store reference to restore later
      this.originalParent = range.startContainer.parentNode;
      
      // Process the fragment and wrap words
      this.wrapWordsInFragment(fragment);
      
      // Insert the wrapped content
      this.selectionContainer.appendChild(fragment);
      range.insertNode(this.selectionContainer);
      
    } catch (e) {
      console.log('SpeakEasy: Could not wrap selection, using fallback highlighting');
      this.selectionContainer = null;
    }
  }

  wrapWordsInFragment(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text.trim()) return node;
      
      const wrapper = document.createElement('span');
      const words = text.split(/(\s+)/);
      
      words.forEach(word => {
        if (word.trim()) {
          const wordSpan = document.createElement('span');
          wordSpan.className = 'speakeasy-word';
          wordSpan.textContent = word;
          wrapper.appendChild(wordSpan);
          this.wordElements.push(wordSpan);
        } else {
          wrapper.appendChild(document.createTextNode(word));
        }
      });
      
      node.parentNode?.replaceChild(wrapper, node);
      return wrapper;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Process child nodes
      const children = Array.from(node.childNodes);
      children.forEach(child => this.wrapWordsInFragment(child));
      return node;
    }
    return node;
  }

  restoreOriginalContent() {
    if (this.selectionContainer && this.selectionContainer.parentNode) {
      // Remove highlight classes
      this.wordElements.forEach(el => el.classList.remove('speakeasy-word-active'));
      
      // Unwrap the content
      const parent = this.selectionContainer.parentNode;
      while (this.selectionContainer.firstChild) {
        parent.insertBefore(this.selectionContainer.firstChild, this.selectionContainer);
      }
      parent.removeChild(this.selectionContainer);
      
      // Normalize to merge adjacent text nodes
      parent.normalize();
    }
    
    this.selectionContainer = null;
    this.wordElements = [];
  }

  speak() {
    // Make sure voices are loaded
    this.applyVoice();
    
    this.synth.cancel();
    this.currentWordIndex = 0;
    
    // Parse words for tracking
    this.words = this.currentText.split(/\s+/).filter(w => w.length > 0);
    
    this.utterance = new SpeechSynthesisUtterance(this.currentText);
    this.utterance.rate = this.settings.rate;
    
    // Apply selected voice
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
      this.updateProgress(100);
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
    this.utterance.onboundary = (e) => {
      if (e.name === 'word') {
        this.highlightWordAt(e.charIndex);
      }
    };

    this.synth.speak(this.utterance);
  }

  highlightWordAt(charIndex) {
    // Find which word index based on character position
    let charCount = 0;
    let wordIndex = 0;
    
    for (let i = 0; i < this.words.length; i++) {
      const wordStart = this.currentText.indexOf(this.words[i], charCount);
      const wordEnd = wordStart + this.words[i].length;
      
      if (charIndex >= wordStart && charIndex < wordEnd) {
        wordIndex = i;
        break;
      }
      charCount = wordEnd;
    }
    
    this.currentWordIndex = wordIndex;
    
    // Clear previous highlights
    this.wordElements.forEach(el => el.classList.remove('speakeasy-word-active'));
    
    // Highlight current word in the actual text
    if (this.wordElements[wordIndex]) {
      this.wordElements[wordIndex].classList.add('speakeasy-word-active');
      
      // Scroll into view if needed
      this.wordElements[wordIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
    
    // Update progress bar
    const progress = ((wordIndex + 1) / this.words.length) * 100;
    this.updateProgress(progress);
  }

  updateProgress(percent) {
    const fill = this.toolbar.querySelector('.speakeasy-progress-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  }

  clearHighlights() {
    this.wordElements.forEach(el => el.classList.remove('speakeasy-word-active'));
    this.updateProgress(0);
  }

  play() {
    if (this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
    } else if (!this.isPlaying && this.currentText) {
      this.speak();
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
    this.restoreOriginalContent();
    this.updateToolbarState();
  }

  updateToolbarState() {
    const playBtn = this.toolbar.querySelector('#speakeasy-play');
    const pauseBtn = this.toolbar.querySelector('#speakeasy-pause');
    
    if (this.isPlaying && !this.isPaused) {
      playBtn.classList.add('active');
      pauseBtn.classList.remove('active');
    } else if (this.isPaused) {
      playBtn.classList.remove('active');
      pauseBtn.classList.add('active');
    } else {
      playBtn.classList.remove('active');
      pauseBtn.classList.remove('active');
    }
  }
}

// Initialize
const speakeasy = new SpeakEasy();
