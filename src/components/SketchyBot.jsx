import { useState } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

const SKETCHY_BOT = {
  username: 'sketchy',
  displayName: 'Sketchy',
};

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro-002",
  safetySettings: [
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_NONE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
  ],
});

const SketchyBot = ({ onBotReply }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleMention = async (messageContent, username) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      const prompt = `You are Sketchy, an AI security expert chatbot. You only answer questions related to information security, cyber security, digital forensics, and incident response. If asked about any other topic, politely decline and remind the user that you only discuss security-related matters.

Your responses should be:
1. Focused on security topics only
2. Concise but informative
3. Include relevant technical details when appropriate
4. Reference industry best practices and standards
5. Mention MITRE ATT&CK tactics/techniques when relevant

Current chat context:
${username}: ${messageContent}

Your response:`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      const botReply = {
        content: response,
        username: SKETCHY_BOT.username,
        timestamp: new Date().toISOString(),
        isBot: true
      };

      onBotReply(botReply);
      
    } catch (error) {
      console.error('Sketchy bot error:', error);
      const errorReply = {
        content: "I encountered an error processing your request. Please try again later.",
        username: SKETCHY_BOT.username,
        timestamp: new Date().toISOString(),
        isBot: true,
        isError: true
      };
      onBotReply(errorReply);
    } finally {
      setIsProcessing(false);
    }
  };

  return null; // This is a functional component with no UI
};

export default SketchyBot; 