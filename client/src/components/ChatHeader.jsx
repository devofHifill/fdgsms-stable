import { Search, MoreVertical } from "lucide-react";

function ChatHeader({ chat }) {
  return (
    <div className="chatheader">
      <div className="chatheader__left">
        <div className="chatheader__avatar">{chat.name.charAt(0)}</div>

        <div>
          <h3>{chat.name}</h3>
          <p>{chat.status || "online"}</p>
        </div>
      </div>

      <div className="chatheader__right">
        <button title="Search">
          <Search size={18} />
        </button>
        <button title="Menu">
          <MoreVertical size={18} />
        </button>
      </div>
    </div>
  );
}

export default ChatHeader;