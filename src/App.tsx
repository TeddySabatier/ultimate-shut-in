import { Component, lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useGameTick } from './hooks/useGameTick';
import { useReducedMotionAttribute } from './hooks/useReducedMotion';
import { debugEnabled } from './state/debug';
import { strings } from './game';
import { useGameStore } from './state/gameStore';
import { CharacterScreen } from './screens/CharacterScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MapScreen } from './screens/MapScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// The Arena (brief G): its own chunk. It is the only importer of the game registry, so no game reaches the main bundle.
const ArenaScreen = lazy(() => import('./screens/ArenaScreen'));

/** `#/arena`: loaded on demand; a chunk that fails to load (offline, a deploy in between) shows a retry. */
function ArenaRoute() {
  return (
    <LabLoadBoundary title={strings.arena.host.routeFailed}>
      <Suspense fallback={<p className="muted">{strings.arena.host.loading}</p>}>
        <ArenaScreen />
      </Suspense>
    </LabLoadBoundary>
  );
}

/** Tabs and overlays; mounted only once a save exists and onboarding is done. */
function GameRoutes() {
  useGameTick();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="quests" element={<QuestsScreen />} />
        <Route path="map" element={<MapScreen />} />
        <Route path="arena" element={<ArenaRoute />} />
        <Route path="character" element={<CharacterScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// The Games Lab (src/games/lab): a dev tool, in its own chunk, loaded only when allowed.
const GamesLab = lazy(() => import('./games/lab/LabRoutes'));

/** A chunk that fails to load (offline, a deploy in between) shows a retry instead of a blank page. */
class LabLoadBoundary extends Component<{ children: ReactNode; title?: string }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" style={{ padding: 'var(--space-4)' }}>
        <h1>{this.props.title ?? 'The Games Lab did not load'}</h1>
        <p className="muted">{this.state.error.message}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }
}

/** `#/lab/*`: dev builds, or `localStorage['haven.debug'] === '1'` (the e2e helpers set it); otherwise back to the Haven. */
function LabGate() {
  if (!debugEnabled()) return <Navigate to="/" replace />;
  return (
    <LabLoadBoundary>
      <Suspense fallback={<p className="muted">Loading the Games Lab...</p>}>
        <GamesLab />
      </Suspense>
    </LabLoadBoundary>
  );
}

export default function App() {
  useReducedMotionAttribute();
  const onboarded = useGameStore((s) => s.onboarded);
  return (
    <HashRouter>
      <Routes>
        <Route path="lab/*" element={<LabGate />} />
        <Route path="*" element={onboarded ? <GameRoutes /> : <OnboardingScreen />} />
      </Routes>
    </HashRouter>
  );
}
