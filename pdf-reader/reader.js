// SpeakEasy PDF Reader

class PDFReader {
  constructor() {
    this.pdf = null;
    this.pages = [];
    this.currentPage = 1;
    this.totalPages = 0;
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.words = [];
    this.currentWordIndex = 0;
    this.settings = {
      rate: 1.0,
      voice: null
    };

    this.init();
  }

  init() {
    this.loadSettings();
    this.setupDropZone();
    this.setupControls();
    this.loadVoices();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['rate', 'voiceURI']);
      if (result.rate) {
        this.settings.rate = result.rate;
        document.getElementById('speed').value = result.rate;
        document.getElementById('speed-value').textContent = `${result.rate}x`;
      }
    } catch (e) {
      console.log('Using default settings');
    }
  }

  loadVoices() {
    const select = document.getElementById('voice-select');
    
    const populateVoices = () => {
      const voices = this.synth.getVoices();
      select.innerHTML = '<option value="">System Default</option>';
      
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;
        select.appendChild(option);
      });
    };

    populateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populateVoices;
    }
  }

  setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const loadUrlBtn = document.getElementById('load-url-btn');
    const pdfUrlInput = document.getElementById('pdf-url');

    // Browse button
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    // Click on drop zone
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.loadFile(e.target.files[0]);
      }
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      
      if (e.dataTransfer.files.length > 0) {
        this.loadFile(e.dataTransfer.files[0]);
      }
    });

    // URL loading
    loadUrlBtn.addEventListener('click', () => {
      const url = pdfUrlInput.value.trim();
      if (url) {
        this.loadFromUrl(url);
      }
    });

    pdfUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const url = pdfUrlInput.value.trim();
        if (url) {
          this.loadFromUrl(url);
        }
      }
    });
  }

  setupControls() {
    document.getElementById('play-btn').addEventListener('click', () => this.play());
    document.getElementById('pause-btn').addEventListener('click', () => this.pause());
    document.getElementById('stop-btn').addEventListener('click', () => this.stop());

    document.getElementById('speed').addEventListener('input', (e) => {
      this.settings.rate = parseFloat(e.target.value);
      document.getElementById('speed-value').textContent = `${this.settings.rate}x`;
      chrome.storage.sync.set({ rate: this.settings.rate });
    });

    document.getElementById('voice-select').addEventListener('change', (e) => {
      const voices = this.synth.getVoices();
      this.settings.voice = voices.find(v => v.voiceURI === e.target.value) || null;
      chrome.storage.sync.set({ voiceURI: e.target.value });
    });

    document.getElementById('prev-page').addEventListener('click', () => this.changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => this.changePage(1));
  }

  showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('url-input-section').style.display = 'none';
  }

  hideLoading() {
    document.getElementById('loading').style.display = 'none';
  }

  showReader() {
    document.getElementById('reader-section').style.display = 'block';
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('url-input-section').style.display = 'none';
  }

  async loadFile(file) {
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    this.showLoading();
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      await this.processPDF(arrayBuffer);
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Error loading PDF: ' + error.message);
      this.hideLoading();
    }
  }

  async loadFromUrl(url) {
    this.showLoading();
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch PDF');
      
      const arrayBuffer = await response.arrayBuffer();
      await this.processPDF(arrayBuffer);
    } catch (error) {
      console.error('Error loading PDF from URL:', error);
      alert('Error loading PDF: ' + error.message + '\n\nNote: Some PDFs may be blocked by CORS policies.');
      this.hideLoading();
    }
  }

  async processPDF(arrayBuffer) {
    try {
      this.pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.totalPages = this.pdf.numPages;
      this.currentPage = 1;
      
      // Extract text from all pages
      this.pages = [];
      for (let i = 1; i <= this.totalPages; i++) {
        const page = await this.pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        this.pages.push(text);
      }
      
      this.hideLoading();
      this.showReader();
      this.displayPage(1);
      this.updatePageInfo();
    } catch (error) {
      console.error('Error processing PDF:', error);
      alert('Error processing PDF: ' + error.message);
      this.hideLoading();
    }
  }

  displayPage(pageNum) {
    this.currentPage = pageNum;
    const text = this.pages[pageNum - 1] || '';
    const container = document.getElementById('text-content');
    
    // Split into words and wrap each in a span
    this.words = text.split(/\s+/).filter(w => w.length > 0);
    
    container.innerHTML = this.words
      .map((word, i) => `<span class="word" data-index="${i}">${word}</span>`)
      .join(' ');
    
    this.updatePageInfo();
  }

  updatePageInfo() {
    document.getElementById('page-info').textContent = `Page ${this.currentPage} of ${this.totalPages}`;
  }

  changePage(delta) {
    const newPage = this.currentPage + delta;
    if (newPage >= 1 && newPage <= this.totalPages) {
      this.stop();
      this.displayPage(newPage);
    }
  }

  play() {
    if (this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
      this.updateControlStates();
      return;
    }

    if (this.isPlaying) return;

    const text = this.pages[this.currentPage - 1];
    if (!text) return;

    this.currentWordIndex = 0;
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = this.settings.rate;
    
    if (this.settings.voice) {
      this.utterance.voice = this.settings.voice;
    }

    this.utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.updateControlStates();
    };

    this.utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.clearHighlights();
      this.updateControlStates();
      document.getElementById('current-word').textContent = '';
      
      // Auto-advance to next page
      if (this.currentPage < this.totalPages) {
        this.changePage(1);
        setTimeout(() => this.play(), 500);
      }
    };

    this.utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.error('Speech error:', e);
      }
      this.isPlaying = false;
      this.isPaused = false;
      this.clearHighlights();
      this.updateControlStates();
    };

    this.utterance.onboundary = (e) => {
      if (e.name === 'word') {
        this.highlightWord(e.charIndex);
      }
    };

    this.synth.speak(this.utterance);
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      this.updateControlStates();
    }
  }

  stop() {
    this.synth.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentWordIndex = 0;
    this.clearHighlights();
    this.updateControlStates();
    document.getElementById('current-word').textContent = '';
    document.getElementById('progress').style.width = '0%';
  }

  highlightWord(charIndex) {
    // Find which word we're on
    const text = this.pages[this.currentPage - 1];
    let charCount = 0;
    let wordIndex = 0;
    
    for (let i = 0; i < this.words.length; i++) {
      if (charIndex <= charCount + this.words[i].length) {
        wordIndex = i;
        break;
      }
      charCount += this.words[i].length + 1; // +1 for space
    }
    
    this.currentWordIndex = wordIndex;
    
    // Clear previous highlights
    document.querySelectorAll('.word.active').forEach(el => el.classList.remove('active'));
    
    // Highlight current word
    const wordEl = document.querySelector(`.word[data-index="${wordIndex}"]`);
    if (wordEl) {
      wordEl.classList.add('active');
      wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Show current word prominently
      document.getElementById('current-word').textContent = this.words[wordIndex];
    }
    
    // Update progress
    const progress = (wordIndex / this.words.length) * 100;
    document.getElementById('progress').style.width = `${progress}%`;
  }

  clearHighlights() {
    document.querySelectorAll('.word.active').forEach(el => el.classList.remove('active'));
  }

  updateControlStates() {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    
    playBtn.classList.toggle('active', this.isPlaying && !this.isPaused);
    pauseBtn.classList.toggle('active', this.isPaused);
  }
}

// Initialize
const reader = new PDFReader();
