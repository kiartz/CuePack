import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { syncPendingWrites } from '../firebase';

export interface NetworkContextType {
  isOnline: boolean;
  wasOffline: boolean;
  isSyncing: boolean;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
  soundEnabled: boolean;
  toggleSound: () => void;
  dismissReconnectedBanner: () => void;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const STORAGE_KEY_SOUND = 'cuepack_offline_sound_enabled';

// --- BROWSER WEB AUDIO API SOUND SYNTHESIZER ---
const playTone = (frequency: number, type: OscillatorType, duration: number, delay: number = 0) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

    // Smooth envelope attack and decay
    gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, (delay + duration + 0.15) * 1000);
  } catch {
    // Autoplay policy or unsupported audio gracefully ignored
  }
};

const playOfflineAlert = () => {
  // Descending two-tone warning: 520Hz (G4) -> 370Hz (F#4)
  playTone(520, 'triangle', 0.18, 0);
  playTone(370, 'triangle', 0.28, 0.22);
};

const playOnlineChime = () => {
  // Upbeat major triad chime: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
  playTone(523.25, 'sine', 0.1, 0);
  playTone(659.25, 'sine', 0.1, 0.1);
  playTone(783.99, 'sine', 0.25, 0.2);
};

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const [wasOffline, setWasOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SOUND);
    return saved !== null ? saved === 'true' : true;
  });

  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY_SOUND, String(next));
      return next;
    });
  }, []);

  const dismissReconnectedBanner = useCallback(() => {
    setWasOffline(false);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Real Internet Reachability Check (avoids false-positives with router connected but no Internet)
  const testInternetReachability = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // gstatic 204 is Google's ultra-fast connectivity probe with CORS support
      await fetch(`https://www.gstatic.com/generate_204?_=${Date.now()}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Handle transition to Online
  const handleGoOnline = useCallback(async () => {
    const isActuallyReachable = await testInternetReachability();
    if (!isActuallyReachable) {
      // Browser claims online, but real probe failed
      setIsOnline(false);
      return;
    }

    const previouslyOffline = !isOnlineRef.current;
    setIsOnline(true);

    if (previouslyOffline) {
      setWasOffline(true);
      if (soundEnabled) {
        playOnlineChime();
      }

      // Sync pending writes in the background
      setIsSyncing(true);
      try {
        await syncPendingWrites(6000);
      } finally {
        setIsSyncing(false);
      }

      // Auto-dismiss the green reconnection banner after 5 seconds
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setWasOffline(false);
      }, 5000);
    }
  }, [testInternetReachability, soundEnabled]);

  // Handle transition to Offline
  const handleGoOffline = useCallback(() => {
    const previouslyOnline = isOnlineRef.current;
    setIsOnline(false);

    if (previouslyOnline && soundEnabled) {
      playOfflineAlert();
    }
  }, [soundEnabled]);

  // Manual Trigger from UI (e.g. "Verifica Connessione" button)
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    try {
      const reachable = await testInternetReachability();
      if (reachable) {
        await handleGoOnline();
      } else {
        handleGoOffline();
      }
      return reachable;
    } finally {
      setIsChecking(false);
    }
  }, [testInternetReachability, handleGoOnline, handleGoOffline]);

  // Setup Browser Event Listeners
  useEffect(() => {
    const onWindowOnline = () => {
      handleGoOnline();
    };

    const onWindowOffline = () => {
      handleGoOffline();
    };

    const onWindowFocus = () => {
      // Re-verify on window focus
      testInternetReachability().then(reachable => {
        if (reachable && !isOnlineRef.current) {
          handleGoOnline();
        } else if (!reachable && isOnlineRef.current) {
          handleGoOffline();
        }
      });
    };

    window.addEventListener('online', onWindowOnline);
    window.addEventListener('offline', onWindowOffline);
    window.addEventListener('focus', onWindowFocus);

    // Initial reachability test
    testInternetReachability().then(reachable => {
      if (!reachable) {
        setIsOnline(false);
      }
    });

    return () => {
      window.removeEventListener('online', onWindowOnline);
      window.removeEventListener('offline', onWindowOffline);
      window.removeEventListener('focus', onWindowFocus);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [handleGoOnline, handleGoOffline, testInternetReachability]);

  // Heartbeat Poller:
  // When offline: check every 6 seconds to automatically detect when network returns.
  // When online: quiet check every 30 seconds.
  useEffect(() => {
    const intervalMs = isOnline ? 30000 : 6000;
    const interval = setInterval(async () => {
      const reachable = await testInternetReachability();
      if (reachable && !isOnlineRef.current) {
        handleGoOnline();
      } else if (!reachable && isOnlineRef.current) {
        handleGoOffline();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isOnline, testInternetReachability, handleGoOnline, handleGoOffline]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        wasOffline,
        isSyncing,
        isChecking,
        checkConnection,
        soundEnabled,
        toggleSound,
        dismissReconnectedBanner,
        isCollapsed,
        setIsCollapsed
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkStatus = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within a NetworkProvider');
  }
  return context;
};
