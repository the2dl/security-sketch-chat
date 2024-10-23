import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen bg-base-100">
          <div className="container mx-auto px-4">
            <Navbar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/chat/:roomId" element={<ChatRoom />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
