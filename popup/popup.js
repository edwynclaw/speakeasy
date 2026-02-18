// SpeakEasy Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const speedSlider = document.getElementById('speed');
  const speedValue = document.getElementById('speed-value');
  const voiceSelect = document.getElementById('voice');
  const highlightCheckbox = document.getElementById('highlight');

  // Load saved settings
  const settings = await chrome.storage.sync.get(['rate', 'voiceURI', 'highlightWords']);
  
  if (settings.rate) {
    speedSlider.value = settings.rate;
    speedValue.textContent = `${settings.rate}x`;
  }
  
  if (settings.highlightWords !== undefined) {
    highlightCheckbox.checked = settings.highlightWords;
  }

  // Populate voices with quality indicators
  function loadVoices() {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    
    if (voices.length === 0) return;
    
    // Sort voices: premium/enhanced first, then by language
    const sortedVoices = voices.sort((a, b) => {
      const aScore = getVoiceQualityScore(a);
      const bScore = getVoiceQualityScore(b);
      if (bScore !== aScore) return bScore - aScore;
      return a.name.localeCompare(b.name);
    });
    
    voiceSelect.innerHTML = '<option value="">System Default</option>';
    
    // Group by quality
    let lastQuality = null;
    
    sortedVoices.forEach(voice => {
      const quality = getVoiceQuality(voice);
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      
      // Add quality indicator
      let prefix = '';
      if (quality === 'premium') prefix = '⭐ ';
      else if (quality === 'enhanced') prefix = '✨ ';
      
      option.textContent = `${prefix}${voice.name}`;
      
      if (settings.voiceURI === voice.voiceURI) {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });
  }

  function getVoiceQualityScore(voice) {
    const name = voice.name.toLowerCase();
    // Premium voices (neural/natural)
    if (name.includes('premium') || name.includes('neural') || name.includes('natural')) return 3;
    // Enhanced/Siri voices on Mac
    if (name.includes('enhanced') || name.includes('siri')) return 2;
    // Google voices tend to be good
    if (name.includes('google')) return 1;
    return 0;
  }

  function getVoiceQuality(voice) {
    const score = getVoiceQualityScore(voice);
    if (score >= 2) return 'premium';
    if (score >= 1) return 'enhanced';
    return 'standard';
  }

  // Load voices (may need to wait)
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  // Fallback: try again after a short delay
  setTimeout(loadVoices, 100);

  // Get current state from content script
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      updateButtonStates(response.isPlaying, response.isPaused);
    }
  });

  function updateButtonStates(isPlaying, isPaused) {
    playBtn.classList.toggle('active', isPlaying && !isPaused);
    pauseBtn.classList.toggle('active', isPaused);
  }

  // Control buttons
  playBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'control', command: 'play' });
    updateButtonStates(true, false);
  });

  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'control', command: 'pause' });
    updateButtonStates(true, true);
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'control', command: 'stop' });
    updateButtonStates(false, false);
  });

  // Speed slider
  speedSlider.addEventListener('input', (e) => {
    const rate = parseFloat(e.target.value);
    speedValue.textContent = `${rate}x`;
    chrome.storage.sync.set({ rate });
  });

  // Voice selection - save immediately on change
  voiceSelect.addEventListener('change', (e) => {
    const voiceURI = e.target.value;
    chrome.storage.sync.set({ voiceURI });
    
    // Show feedback
    voiceSelect.style.borderColor = '#e94560';
    setTimeout(() => {
      voiceSelect.style.borderColor = '';
    }, 500);
  });

  // Highlight toggle
  highlightCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ highlightWords: e.target.checked });
  });

  // PDF Reader button
  document.getElementById('pdf-reader-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pdf-reader/reader.html') });
  });
});
