import { useState } from 'react';
import { api } from '../api/api';
import { formatWhoisResult, parseWhoisData } from '../utils/whoisUtil';
import { formatVTResult } from '../utils/vtUtil';
import { FaNetworkWired, FaLock } from 'react-icons/fa';

export const COMMANDS = {
  include: {
    description: 'Force message to be analyzed by AI',
    handler: (message) => {
      const content = message.replace('/include', '').trim();
      if (!content) return null;
      
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
        const parsedData = parseWhoisData(whoisData);
        const formattedResult = formatWhoisResult(parsedData);
        
        if (formattedResult === 'No WHOIS data available') {
          return {
            content: `No WHOIS data found for domain: ${domain}`,
            llm_required: true,
            messageType: 'command',
            isError: true
          };
        }
        
        return {
          content: `WHOIS lookup for ${domain}:\n\`\`\`\n\n${formattedResult}\n\n\`\`\``,
          llm_required: true,
          messageType: 'command'
        };
      } catch (error) {
        return {
          content: `Error performing WHOIS lookup: ${error.message}`,
          llm_required: true,
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
        const formattedResult = formatVTResult(vtData);
        
        return {
          content: `VirusTotal results for ${indicator}:\n\`\`\`\n${formattedResult}\n\`\`\``,
          llm_required: true,
          messageType: 'command'
        };
      } catch (error) {
        return {
          content: `Error performing VirusTotal lookup: ${error.message}`,
          llm_required: true,
          messageType: 'command',
          isError: true
        };
      }
    }
  },
  ipinfo: {
    description: 'Lookup IP address information',
    handler: async (message) => {
      const ip = message.replace('/ipinfo', '').trim();
      if (!ip) {
        return {
          content: 'Please provide an IP address (e.g., /ipinfo 1.1.1.1)',
          llm_required: false,
          messageType: 'command',
          isError: true
        };
      }
      
      try {
        const ipData = await api.performIPLookup(ip);
        const formattedResult = [
          `IP: ${ipData.ip}`,
          `Hostname: ${ipData.hostname || 'N/A'}`,
          `Organization: ${ipData.org || 'N/A'}`,
          `Location: ${ipData.city}, ${ipData.region}, ${ipData.country}`,
          `Coordinates: ${ipData.loc}`,
          `Timezone: ${ipData.timezone}`
        ].join('\n');
        
        return {
          content: `IP information for ${ip}:\n\`\`\`\n${formattedResult}\n\`\`\``,
          llm_required: true,
          messageType: 'command'
        };
      } catch (error) {
        return {
          content: `Error performing IP lookup: ${error.message}`,
          llm_required: true,
          messageType: 'command',
          isError: true
        };
      }
    }
  },
  base64: {
    description: 'Decode a base64 encoded string',
    handler: async (message) => {
      const encodedString = message.replace('/base64', '').trim();
      if (!encodedString) {
        return {
          content: 'Please provide a base64 encoded string (e.g., /base64 SGVsbG8gV29ybGQ=)',
          llm_required: false,
          messageType: 'command',
          isError: true
        };
      }
      
      try {
        const result = await api.performBase64Decode(encodedString);
        
        return {
          content: `Base64 Decode:\n\`\`\`\nOriginal: ${result.original}\nDecoded:  ${result.decoded}\n\`\`\``,
          llm_required: true,
          messageType: 'command'
        };
      } catch (error) {
        return {
          content: `Error decoding base64 string: ${error.message}`,
          llm_required: true,
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