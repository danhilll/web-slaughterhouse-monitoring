import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';

const MOTION_KEY = 'slaughterhouse-motion';
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const MotionContext = createContext({ motionEnabled: false, systemReduced: false, toggleMotion: () => {} });

export function WorkspaceMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem(MOTION_KEY) === 'paused'; } catch { return false; }
  });
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia(reducedMotionQuery).matches);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const query = window.matchMedia(reducedMotionQuery);
    const updatePreference = () => setSystemReduced(query.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    query.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      query.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  const toggleMotion = () => {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem(MOTION_KEY, next ? 'paused' : 'enabled'); } catch { /* A private browser can still use the session preference. */ }
  };
  const motionEnabled = !paused && !systemReduced;

  return (
    <MotionContext.Provider value={{ motionEnabled, systemReduced, toggleMotion }}>
      <div className="motion-root" data-motion={motionEnabled ? 'enabled' : 'paused'} data-page-visible={pageVisible}>
        {children}
      </div>
    </MotionContext.Provider>
  );
}

export const useWorkspaceMotion = () => useContext(MotionContext);

export function MotionToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { motionEnabled, systemReduced, toggleMotion } = useWorkspaceMotion();
  const label = systemReduced ? 'Animations reduced by device settings' : motionEnabled ? 'Pause animations' : 'Enable animations';
  return (
    <button type="button" className={`motion-toggle ${showLabel ? 'motion-toggle-labeled' : 'icon-button'}`}
      onClick={toggleMotion} disabled={systemReduced} aria-label={label} title={label}>
      {motionEnabled ? <Pause size={15} /> : <Play size={15} />}
      {showLabel && <span>{systemReduced ? 'Reduced motion' : motionEnabled ? 'Pause motion' : 'Enable motion'}</span>}
    </button>
  );
}
