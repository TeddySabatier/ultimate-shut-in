import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useGameTick } from './hooks/useGameTick';
import { useReducedMotionAttribute } from './hooks/useReducedMotion';
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

export default function App() {
  useReducedMotionAttribute();
  const onboarded = useGameStore((s) => s.onboarded);
  return <HashRouter>{onboarded ? <GameRoutes /> : <OnboardingScreen />}</HashRouter>;
}
