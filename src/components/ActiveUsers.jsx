import { FiUsers } from 'react-icons/fi';

function ActiveUsers({ users = [], currentUser }) {
  return (
    <div className="card bg-base-200 shadow-xl rounded-2xl h-[calc(100vh-8rem)]">
      <div className="card-body">
        <div className="flex items-center gap-2 mb-4">
          <FiUsers className="w-5 h-5" />
          <h2 className="card-title">Active Users</h2>
        </div>
        
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 
                ${user.username === currentUser ? 'bg-primary/10' : 'hover:bg-base-300'}`}
            >
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="font-medium">
                {user.username}
                {user.username === currentUser && " (You)"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ActiveUsers;
