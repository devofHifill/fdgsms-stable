function ChatItem({ chat, isActive, onClick }) {
  return (
    <div
      className={`chatitem ${isActive ? "chatitem--active" : ""}`}
      onClick={onClick}
    >
      <div className="chatitem__avatar">{chat.name.charAt(0)}</div>

      <div className="chatitem__content">
        <div className="chatitem__top">
          <h4>{chat.name}</h4>
          <span>{chat.time}</span>
        </div>

        <p>{chat.lastMessage}</p>
      </div>
    </div>
  );
}

export default ChatItem;