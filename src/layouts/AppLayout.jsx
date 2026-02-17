// AppLayout.jsx
import { Outlet, useLocation } from 'react-router-dom';
import GlobalHeader from '../components/GlobalHeader';
import BackgroundPencil3D from '../components/BackgroundPencil3D';
import '../styles/globalHeader.css';
import '../styles/BackgroundPencil.css';

export default function AppLayout({ user }) {
  const location = useLocation();
  const modeLabel = location.pathname.startsWith('/play') ? 'Solo • Daily Word' : 'Menu';

  return (
    <div className="app-root">
      <BackgroundPencil3D />
      <div className="app-foreground">
        <GlobalHeader user={user} modeLabel={modeLabel} />
        <Outlet />
      </div>
    </div>
  );
}