import { useState } from "react";
import { Smile, Paperclip, SendHorizontal } from "lucide-react";

function MessageInput({ onSendMessage }) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text);
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="messageinput">
      <button title="Emoji">
        <Smile size={20} />
      </button>

      <button title="Attach">
        <Paperclip size={20} />
      </button>

      <input
        type="text"
        placeholder="Type a message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <button title="Send" onClick={handleSend}>
        <SendHorizontal size={20} />
      </button>
    </div>
  );
}

export default MessageInput;