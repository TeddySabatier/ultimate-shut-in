import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomeScreen } from './screens/HomeScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { CharacterScreen } from './screens/CharacterScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomeScreen />} />
          <Route path="quests" element={<QuestsScreen />} />
          <Route path="character" element={<CharacterScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
