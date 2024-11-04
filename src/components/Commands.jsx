import { useState } from 'react';

export const COMMANDS = {
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
  },
  slap: {
    description: 'Gently remind someone about security practices',
    handler: (message) => {
      const target = message.replace('/slap', '').trim();
      if (!target) return null;
      
      return {
        content: `waves a security policy document at ${target} while muttering about password complexity requirements`,
        llm_required: false,
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