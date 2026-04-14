import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

function ChatWindow({ chat, onSendMessage }) {
  if (!chat) {
    return (
      <div className="chatwindow empty">
        <h2>Select a chat</h2>
      </div>
    );
  }

  return (
    <div className="chatwindow">
      <ChatHeader chat={chat} />
      <MessageList messages={chat.messages} />
      <MessageInput onSendMessage={onSendMessage} />
    </div>
  );
}

export default ChatWindow;