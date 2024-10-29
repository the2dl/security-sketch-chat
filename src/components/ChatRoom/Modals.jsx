import { FaEye, FaCopy } from 'react-icons/fa';

function Modals({ 
  showConfirmModal,
  showSecretKeyModal,
  showRecoveryKeyModal,
  secretKey,
  recoveryKey,
  closeError,
  setShowConfirmModal,
  setShowSecretKeyModal,
  setShowRecoveryKeyModal,
  confirmCloseRoom
}) {
  const SecretInput = ({ value, readOnly }) => {
    const [showSecret, setShowSecret] = useState(false);
    
    const copyToClipboard = async (text, type) => {
      try {
        await navigator.clipboard.writeText(text);
        const toast = document.createElement('div');
        toast.className = 'alert alert-success fixed bottom-4 right-4 w-auto z-50';
        toast.innerHTML = `<span>${type} copied to clipboard!</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    return (
      <div className="relative">
        <input
          type={showSecret ? "text" : "password"}
          className={`input input-bordered w-full pr-12 rounded-xl ${
            !readOnly ? "focus:ring-2 focus:ring-primary" : ""
          } transition-all duration-300`}
          value={value}
          readOnly={readOnly}
        />
        <button
          type="button"
          onClick={() => {
            if (showSecret) {
              copyToClipboard(value, 'Secret key');
              setShowSecret(false);
            } else {
              setShowSecret(true);
            }
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content transition-colors"
        >
          {showSecret ? <FaCopy className="w-5 h-5" /> : <FaEye className="w-5 h-5" />}
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Close Investigation?</h3>
            <p className="text-base-content/70 mb-6">
              Are you sure you want to close this investigation? This action cannot be undone.
            </p>
            {closeError && (
              <div className="alert alert-error mb-4">
                <span>{closeError}</span>
              </div>
            )}
            <div className="modal-action flex gap-3">
              <button 
                className="btn btn-ghost rounded-xl"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-ghost hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl"
                onClick={confirmCloseRoom}
              >
                Close Investigation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secret Key Modal */}
      {showSecretKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Room Secret Key</h3>
            <div className="form-control">
              <SecretInput value={secretKey} readOnly={true} />
            </div>
            <div className="modal-action mt-6">
              <button 
                className="btn btn-ghost rounded-xl"
                onClick={() => setShowSecretKeyModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Key Modal */}
      {showRecoveryKeyModal && recoveryKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Your Recovery Key</h3>
            <p className="text-base-content/70 mb-4">
              Please save this recovery key. You'll need it to recover your session if you get disconnected:
            </p>
            <div className="form-control">
              <SecretInput value={recoveryKey} readOnly={true} />
            </div>
            <div className="modal-action mt-6">
              <button 
                className="btn btn-primary rounded-xl"
                onClick={() => setShowRecoveryKeyModal(false)}
              >
                I've Saved It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Modals; 