import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAnonAuth } from '../lib/useAnonAuth';

import Home from '../pages/Home';
import Play from '../pages/Play';

export default function App() {
  const { user, ready } = useAnonAuth();

  if (!ready) {
    return <div style={{ padding: 24 }}>Signing in…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<Play user={user} />} />
      </Routes>
    </BrowserRouter>
  );
}
