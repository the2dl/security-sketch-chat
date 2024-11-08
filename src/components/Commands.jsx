import { useState } from 'react';
import { api } from '../api/api';
import { formatWhoisResult, parseWhoisData } from '../utils/whoisUtil';
import { formatVTResult } from '../utils/vtUtil';

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
  },
  whois: {
    description: 'Perform WHOIS lookup on a domain',
    handler: async (message) => {
      const domain = message.replace('/whois', '').trim();
      if (!domain) {
        return {
          content: 'Please provide a domain name (e.g., /whois google.com)',
          llm_required: false,
          messageType: 'command',
          isError: true
        };
      }
      
      try {
        const whoisData = await api.performWhois(domain);
        console.log('Raw WHOIS data received by client:', whoisData);
        
        const parsedData = parseWhoisData(whoisData);
        console.log('Parsed WHOIS data:', parsedData);
        
        const formattedResult = formatWhoisResult(parsedData);
        console.log('Formatted WHOIS result:', formattedResult);
        
        if (formattedResult === 'No WHOIS data available') {
          return {
            content: `No WHOIS data found for domain: ${domain}`,
            llm_required: false,
            messageType: 'command',
            isError: true
          };
        }
        
        return {
          content: `WHOIS lookup for ${domain}:\n\`\`\`\n\n${formattedResult}\n\n\`\`\``,
          llm_required: false,
          messageType: 'command'
        };
      } catch (error) {
        return {
          content: `Error performing WHOIS lookup: ${error.message}`,
          llm_required: false,
          messageType: 'command',
          isError: true
        };
      }
    }
  },
  vt: {
    description: 'Lookup indicator in VirusTotal',
    handler: async (message) => {
      const indicator = message.replace('/vt', '').trim();
      if (!indicator) {
        return {
          content: 'Please provide an indicator (hash, domain, IP, or URL)',
          llm_required: false,
          messageType: 'command',
          isError: true
        };
      }
      
      try {
        const vtData = await api.performVTLookup(indicator);
        console.log('Raw VT data received by client:', vtData);
        
        const formattedResult = formatVTResult(vtData);
        
        return {
          content: `VirusTotal results for ${indicator}:\n\`\`\`\n${formattedResult}\n\`\`\``,
          llm_required: false,
          messageType: 'command'
        };
      } catch (error) {
        return {
          content: `Error performing VirusTotal lookup: ${error.message}`,
          llm_required: false,
          messageType: 'command',
          isError: true
        };
      }
    }
  }
};

export const processCommand = async (message) => {
  if (!message.startsWith('/')) return null;
  
  const command = Object.keys(COMMANDS).find(cmd => 
    message.toLowerCase().startsWith(`/${cmd}`)
  );

  if (!command) return null;
  
  return await COMMANDS[command].handler(message);
}; 