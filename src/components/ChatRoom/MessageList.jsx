import { useRef, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';

function MessageList({ messages, username, activeUsers }) {
  const { theme } = useTheme();
  const messagesEndRef = useRef(null);

  const formatMessageContent = (content, username) => {
    const mentionRegex = /@(\w+)/g;
    const parts = content.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 0) return part;
      
      const isActiveUser = activeUsers.some(user => user.username.toLowerCase() === part.toLowerCase());
      const isMentionedUser = part.toLowerCase() === username.toLowerCase();
      
      return (
        <span
          key={index}
          className={`inline-block ${
            isActiveUser 
              ? isMentionedUser
                ? 'bg-primary/20 text-primary-content px-1 rounded'
                : 'bg-base-content/10 px-1 rounded'
              : ''
          }`}
        >
          @{part}
        </span>
      );
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2 min-h-0">
      {messages.map((msg, index) => (
        <div
          key={msg.id || `temp-${index}`}
          className={`flex flex-col ${msg.username === username ? 'items-end' : 'items-start'}`}
        >
          {msg.username !== username && (
            <div className="opacity-70 text-xs flex items-center gap-2 mb-1 px-1">
              <span className="font-medium">{msg.username}</span>
              <span className="text-base-content/50">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
          <div className={`rounded-lg break-words max-w-[75%] px-4 py-2 ${
            msg.username === username 
              ? theme === 'black'
                ? 'bg-indigo-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]' 
                : 'bg-blue-600 text-white shadow-md'
              : theme === 'black'
                ? 'bg-zinc-700 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]'
                : 'bg-gray-200 text-gray-800 shadow-md'
          }`}>
            {formatMessageContent(msg.content, username)}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageList; 