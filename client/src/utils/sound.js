let muted = localStorage.getItem('thvp_muted') === 'true';

export const isSoundMuted = () => muted;

export const setSoundMuted = (val) => {
  muted = val;
  localStorage.setItem('thvp_muted', val ? 'true' : 'false');
};

const playTone = (frequency = 440, type = 'sine', duration = 0.1, volume = 0.5) => {
  if (muted) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    // Set frequency
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    // Set volume envelope (fade out to avoid clicking noises)
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch(e) {
    console.error('Lỗi phát âm thanh:', e);
  }
};

export const playMessageSound = () => {
  // Một tiếng "blip blip" dịu nhẹ (C6 -> E6)
  playTone(1046.50, 'sine', 0.1, 0.15);
  setTimeout(() => playTone(1318.51, 'sine', 0.15, 0.15), 100);
};

export const playNotifySound = () => {
  // Một tiếng "chuông" vang (A5 -> D6)
  playTone(880.00, 'triangle', 0.1, 0.15);
  setTimeout(() => playTone(1174.66, 'triangle', 0.2, 0.15), 150);
};
