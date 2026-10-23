import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, isEmulatorActive } from './firebase';
import AuthenticatedApp from './components/AuthenticatedApp';
import LoginView from './components/LoginView';
import { Loader2 } from 'lucide-react';
import { NetworkProvider } from './context/NetworkContext';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import { EmulatorBanner } from './components/EmulatorBanner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen h-[100dvh] w-screen bg-slate-950 flex items-center justify-center text-slate-500">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <NetworkProvider>
      <NetworkStatusBanner />
      {!user ? (
        <div className="flex flex-col h-screen h-[100dvh] w-screen overflow-hidden">
          {isEmulatorActive && <EmulatorBanner />}
          <div className="flex-1 overflow-auto">
            <LoginView />
          </div>
        </div>
      ) : (
        <AuthenticatedApp />
      )}
    </NetworkProvider>
  );
}