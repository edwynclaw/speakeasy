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

  // Populate voices
  function loadVoices() {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    
    voiceSelect.innerHTML = '<option value="">System Default</option>';
    
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (settings.voiceURI === voice.voiceURI) {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });
  }

  // Load voices (may need to wait)
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }

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
    chrome.runtime.sendMessage({ action: 'control', command: 'setRate', value: rate });
  });

  // Voice selection
  voiceSelect.addEventListener('change', (e) => {
    chrome.storage.sync.set({ voiceURI: e.target.value });
  });

  // Highlight toggle
  highlightCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ highlightWords: e.target.checked });
  });
});
