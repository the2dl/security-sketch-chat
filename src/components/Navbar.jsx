import { useTheme } from '../context/ThemeContext';
import { FiSun, FiMoon } from 'react-icons/fi';
import { HiOutlineLogout } from 'react-icons/hi';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';

function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const isInChatRoom = location.pathname.includes('/chat/');

  const handleEndChat = () => {
    setShowConfirmModal(true);
  };

  const confirmEndChat = () => {
    setShowConfirmModal(false);
    navigate('/');
  };

  return (
    <>
      <div className="navbar bg-base-200 rounded-lg mt-4">
        <div className="flex-1">
          <span className="text-xl font-bold">Security Sketch</span>
        </div>
        <div className="flex-none gap-3">
          {isInChatRoom && (
            <button 
              onClick={handleEndChat}
              className="btn btn-ghost btn-sm px-4 hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl border-none transition-all duration-300"
            >
              <HiOutlineLogout className="w-5 h-5 mr-1.5" />
              Terminate Room
            </button>
          )}
          <button 
            onClick={toggleTheme}
            className="btn btn-ghost btn-circle"
          >
            {theme === 'black' ? (
              <FiSun className="w-7 h-7" />
            ) : (
              <FiMoon className="w-7 h-7" />
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Terminate Room?</h3>
            <p className="text-base-content/70 mb-6">
              Are you sure you want to terminate this room? This action cannot be undone.
            </p>
            <div className="modal-action flex gap-3">
              <button 
                className="btn btn-ghost rounded-xl"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-ghost hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl"
                onClick={confirmEndChat}
              >
                Terminate Room
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
