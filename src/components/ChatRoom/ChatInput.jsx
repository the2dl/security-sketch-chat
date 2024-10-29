import { useRef, useState } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

function ChatInput({ username, message, setMessage, sendMessage, activeUsers, roomName }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    const textarea = e.target;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    const wordBeforeCursor = text.slice(0, cursorPosition).split(/\s/).pop();
    
    if (wordBeforeCursor.startsWith('@')) {
      const filter = wordBeforeCursor.slice(1).toLowerCase();
      setMentionFilter(filter);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
    
    setMessage(text);
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  const handleMentionClick = (username) => {
    const textarea = textareaRef.current;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    const mentionStart = text.slice(0, cursorPosition).lastIndexOf('@');
    const newText = text.slice(0, mentionStart) + '@' + username + ' ' + text.slice(cursorPosition);
    
    setMessage(newText);
    setShowMentions(false);
    textarea.focus();
  };

  const onEmojiSelect = (emoji) => {
    setMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  return (
    <form onSubmit={sendMessage} className="mt-4">
      <div className="flex gap-2 items-start relative">
        {/* Command prompt-style prefix */}
        <span className="font-mono text-base-content/70 pt-2.5 text-sm whitespace-nowrap">
          {username.toLowerCase()}@sketch  ~/{roomName.toLowerCase()}>
        </span>
        
        {/* Input area */}
        <div className="flex-1 flex items-start gap-2">
          <div className="relative flex-1 z-40">
            <textarea
              ref={textareaRef}
              rows="1"
              placeholder="Type your message..."
              className="w-full bg-transparent font-mono text-sm focus:outline-none resize-none overflow-hidden pt-2.5"
              value={message}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e);
                } else if (e.key === 'Escape') {
                  setShowMentions(false);
                }
              }}
            />
            
            {/* Mentions popup */}
            {showMentions && (
              <div className="fixed transform -translate-y-full left-auto mb-2 w-48 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50">
                {activeUsers
                  .filter(user => 
                    user.username.toLowerCase().includes(mentionFilter) &&
                    user.username.toLowerCase() !== username.toLowerCase()
                  )
                  .map(user => (
                    <button
                      key={user.username}
                      onClick={() => handleMentionClick(user.username)}
                      className="w-full px-4 py-2 text-left hover:bg-base-300 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {user.username}
                    </button>
                  ))}
              </div>
            )}
            
            {/* Emoji picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-full right-0 mb-2 z-50">
                <Picker 
                  data={data} 
                  onEmojiSelect={onEmojiSelect}
                  theme={theme === 'black' ? 'dark' : 'light'}
                />
              </div>
            )}
          </div>
          
          {/* Action buttons */}
          <button 
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="font-mono text-sm text-base-content/50 hover:text-base-content pt-2.5"
          >
            😊
          </button>
          <button 
            type="submit"
            className="font-mono text-sm text-base-content/50 hover:text-base-content pt-2.5"
          >
            [send]
          </button>
        </div>
      </div>
    </form>
  );
}

export default ChatInput; 