/**
 * The Games Lab: a dev tool to list and play every game (dev-only ones
 * included) with the test parties and runs. Mounted by `src/App.tsx` at
 * `#/lab/*`, lazily, and only in dev builds or with `localStorage['haven.debug'] === '1'`.
 * It never reads or writes the player's save.
 *
 * `src/games/lab/` is the one folder under `src/games/` allowed to use the
 * router (eslint.config.js); it still never touches the store.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { LabGame } from './LabGame';
import { LabHome } from './LabHome';

export default function LabRoutes() {
  return (
    <Routes>
      <Route index element={<LabHome />} />
      <Route path=":id" element={<LabGame />} />
      <Route path="*" element={<Navigate to="/lab" replace />} />
    </Routes>
  );
}
