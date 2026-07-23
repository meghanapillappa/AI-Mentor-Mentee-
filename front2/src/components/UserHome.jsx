export default function UserHome({ username, onLogout }) {
  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Welcome, {username}</h1>
          <p>Your account doesn't have any tools assigned yet.</p>
        </div>
        <button className="ghost-btn" onClick={onLogout}>Log out</button>
      </header>
    </div>
  );
}