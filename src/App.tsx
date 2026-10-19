import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useGameTick } from './hooks/useGameTick';
import { useReducedMotionAttribute } from './hooks/useReducedMotion';
import { debugEnabled } from './state/debug';
import { useGameStore } from './state/gameStore';
import { CharacterScreen } from './screens/CharacterScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MapScreen } from './screens/MapScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/** Tabs and overlays; mounted only once a save exists and onboarding is done. */
function GameRoutes() {
  useGameTick();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="quests" element={<QuestsScreen />} />
        <Route path="map" element={<MapScreen />} />
        <Route path="character" element={<CharacterScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// The Games Lab (src/games/lab): a dev tool, in its own chunk, loaded only when allowed.
const GamesLab = lazy(() => import('./games/lab/LabRoutes'));

/** `#/lab/*`: dev builds, or `localStorage['haven.debug'] === '1'` (the e2e helpers set it); otherwise back to the Haven. */
function LabGate() {
  if (!debugEnabled()) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<p className="muted">Loading the Games Lab...</p>}>
      <GamesLab />
    </Suspense>
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
