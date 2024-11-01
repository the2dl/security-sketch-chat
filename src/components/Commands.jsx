import { useState } from 'react';

const COMMANDS = {
  include: {
    description: 'Force message to be analyzed by AI',
    handler: (message) => {
      const content = message.replace('/include', '').trim();
      if (!content) return null; // Don't process empty messages
      
      return {
        content,
        llm_required: true,
        messageType: 'command'
      };
    }
  }
};

export const processCommand = (message) => {
  if (!message.startsWith('/')) return null;
  
  const command = Object.keys(COMMANDS).find(cmd => 
    message.toLowerCase().startsWith(`/${cmd}`)
  );

  if (!command) return null;
  
  const result = COMMANDS[command].handler(message);
  if (result) {
    result.messageType = 'command';
  }
  return result;
}; 