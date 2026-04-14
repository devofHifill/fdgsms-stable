import ChatItem from "./ChatItem";

function ChatList({
  chats,
  selectedChat,
  onSelectChat,
  searchTerm,
  onSearchChange,
}) {
  return (
    <div className="chatlist">
      <div className="chatlist__header">
        <h2>Chats</h2>
      </div>

      <div className="chatlist__search">
        <input
          type="text"
          placeholder="Search or start new chat"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="chatlist__items">
        {chats.length > 0 ? (
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={selectedChat?.id === chat.id}
              onClick={() => onSelectChat(chat)}
            />
          ))
        ) : (
          <div className="chatlist__empty">No chats found</div>
        )}
      </div>
    </div>
  );
}

export default ChatList;