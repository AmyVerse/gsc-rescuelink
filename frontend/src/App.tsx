import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import MapComponent from './components/MapComponent';
import Feed from './pages/Feed';
import About from './pages/About';
import IncidentDetails from './pages/IncidentDetails';
import GodModeContainer from './components/god-mode/GodModeContainer';
import Upload from './pages/Upload';
import Success from './pages/Success';
import AdminDashboard from './pages/AdminDashboard';
import SOSButton from './components/SOSButton';
import MinimalSOS from './pages/MinimalSOS';

const Navigation = () => {
  const location = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const items = [
    { label: 'MAP', path: '/map' },
    { label: 'FEED', path: '/' },
    { label: 'ABOUT', path: '/about' },
    { label: 'ADMIN', path: '/admin' }
  ];

  return (
    <header className="fixed top-0 w-full flex justify-center py-4 md:py-8 z-2000">
      <nav className="bg-surface p-1 flex items-center relative border border-espresso/20 rounded-sm mx-4 md:mx-0 shadow-sm">
        <LayoutGroup>
          {items.map((item) => {
            const isActive = location.pathname === item.path;
            const isHovered = hovered === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onMouseEnter={() => setHovered(item.path)}
                onMouseLeave={() => setHovered(null)}
                className={`relative px-4 md:px-8 py-2 md:py-3 w-[80px] md:w-[120px] text-center text-[11px] md:text-[13px] font-black tracking-widest transition-colors duration-300 z-10 ${isActive ? 'text-white' : 'text-espresso/40 hover:text-espresso/80'
                  }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-x-1 inset-y-1 bg-espresso z-[-1] rounded-xs"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <AnimatePresence>
                  {isHovered && !isActive && (
                    <motion.div
                      layoutId="hover-pill"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-x-1 inset-y-1 bg-espresso/5 z-[-2] rounded-xs border border-espresso/10"
                      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                    />
                  )}
                </AnimatePresence>
                {item.label}
              </NavLink>
            );
          })}
        </LayoutGroup>
        <div className="ml-1 hidden md:block">
          <SOSButton isFixed={false} className="w-[80px] md:w-[100px] h-[32px] md:h-[40px] !border-2 !rounded-xs" />
        </div>
      </nav>
    </header>
  );
};

const AppContent = () => {
  const location = useLocation();
  const isMapRoute = location.pathname === '/map';

  return (
    <div className="w-screen h-screen">
      <Navigation />
      <main className="relative w-full h-full pt-[80px] md:pt-[100px] z-50">
        <div className={`fixed inset-0 z-10 transition-opacity duration-300 ${isMapRoute ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <MapComponent />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={`max-w-7xl mx-auto h-full overflow-y-auto ${isMapRoute ? 'pointer-events-none' : ''}`}
          >
            <div className="mx-auto px-4 md:px-10 w-full">
              <Routes location={location}>
                <Route path="/map" element={null} />
                <Route path="/" element={<Feed />} />
                <Route path="/about" element={<About />} />
                <Route path="/incident/:incidentId" element={<IncidentDetails />} />
              </Routes>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <Routes>
      <Route path="/sos-minimal" element={<MinimalSOS />} />
      <Route path="/godmode" element={<GodModeContainer />} />
      <Route path="/upload" element={<Upload />} />
      <Route path="/success" element={<Success />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/*" element={<AppContent />} />
    </Routes>
  );
}