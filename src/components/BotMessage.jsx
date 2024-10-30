import { FaRobot } from 'react-icons/fa';

function BotMessage({ message, timestamp }) {
  return (
    <div className="flex flex-col items-start">
      <div className="opacity-70 text-xs flex items-center gap-2 mb-1 px-1">
        <span className="font-medium flex items-center gap-1.5">
          <FaRobot className="w-3.5 h-3.5 text-purple-400" />
          SecurityBot
        </span>
        <span className="text-base-content/50">
          {new Date(timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="rounded-lg break-words max-w-[75%] px-4 py-2 bg-purple-900/30 text-purple-100 shadow-md border border-purple-500/20">
        {message}
      </div>
    </div>
  );
}

export default BotMessage; 