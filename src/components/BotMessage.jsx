import { FaRobot } from 'react-icons/fa';

function BotMessage({ message, timestamp, theme }) {
  const getBotStyles = () => {
    if (theme === 'corporate') {
      return {
        icon: 'text-primary',
        message: 'bg-primary/10 text-primary-content border border-primary/20 shadow-md'
      };
    }
    // Default dark theme styles
    return {
      icon: 'text-purple-400',
      message: 'bg-purple-900/30 text-purple-100 border border-purple-500/20 shadow-md'
    };
  };

  const styles = getBotStyles();

  return (
    <div className="flex flex-col items-start">
      <div className="opacity-70 text-xs flex items-center gap-2 mb-1 px-1">
        <span className="font-medium flex items-center gap-1.5">
          <FaRobot className={`w-3.5 h-3.5 ${styles.icon}`} />
          sketchy
        </span>
        <span className="text-base-content/50">
          {new Date(timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className={`rounded-lg break-words max-w-[75%] px-4 py-2 ${styles.message}`}>
        {message}
      </div>
    </div>
  );
}

export default BotMessage; 