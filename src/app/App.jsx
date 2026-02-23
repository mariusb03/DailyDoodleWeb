import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAnonAuth } from '../lib/useAnonAuth';

import Home from '../pages/Home';
import Play from '../pages/Play';
import AppLayout from '../layouts/AppLayout';

export default function App() {
  const { user, ready } = useAnonAuth();

  if (!ready) {
    return <div style={{ padding: 24 }}>Signing in…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout user={user} />}>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/play" element={<Play user={user} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
