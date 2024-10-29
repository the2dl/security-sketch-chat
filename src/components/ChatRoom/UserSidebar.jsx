function UserSidebar({ activeUsers }) {
  return (
    <div className="col-span-1 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden">
      <div className="card-body overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
            Active Users ({activeUsers.length})
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeUsers.map(user => (
            <div 
              key={user.username}
              className="badge badge-primary bg-primary/10 border-primary/20 text-primary-content gap-2 p-3 rounded-lg"
            >
              <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
              {user.username}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UserSidebar; 