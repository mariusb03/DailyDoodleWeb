import { Outlet, useLocation } from 'react-router-dom';
import GlobalHeader from '../components/GlobalHeader';
import '../styles/globalHeader.css';

export default function AppLayout({ user }) {
  const location = useLocation();

  const modeLabel = location.pathname.startsWith('/play')
    ? 'Solo • Daily Word'
    : 'Menu';

  return (
    <>
      <GlobalHeader user={user} modeLabel={modeLabel} />
      <Outlet />
    </>
  );
}
