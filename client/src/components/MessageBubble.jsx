function MessageBubble({ message }) {
  return (
    <div className={`messagebubble ${message.type}`}>
      <div className="messagebubble__text">{message.text}</div>
      <div className="messagebubble__time">{message.time}</div>
    </div>
  );
}

export default MessageBubble;