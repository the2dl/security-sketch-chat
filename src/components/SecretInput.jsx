import React, { useState } from 'react';
import { FaEye, FaCopy } from 'react-icons/fa';

function SecretInput({ value, onChange, placeholder, readOnly }) {
  const [showSecret, setShowSecret] = useState(false);
  
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      const toast = document.createElement('div');
      toast.className = 'alert alert-success fixed bottom-4 right-4 w-auto z-50';
      toast.innerHTML = `<span>Secret key copied to clipboard!</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.remove();
      }, 3000);
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
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
      />
      <button
        type="button"
        onClick={() => {
          if (showSecret) {
            copyToClipboard(value);
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
}

export default SecretInput; 