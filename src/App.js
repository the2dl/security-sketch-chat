import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';
import Admin from './components/Admin';
import InstallPrompt from './components/InstallPrompt';

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <Router>
          <div className="min-h-screen bg-base-100">
            <div className="container mx-auto px-4">
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/chat/:roomId" element={<ChatRoom />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
              <InstallPrompt />
            </div>
          </div>
        </Router>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
