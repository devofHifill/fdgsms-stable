import { MdChat, MdDonutLarge } from "react-icons/md";
import { Star, Settings } from "lucide-react";

function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar__top">
        <div className="sidebar__avatar">N</div>

        <div className="sidebar__menu">
          <button title="Chats">
            <MdChat />
          </button>
          <button title="Status">
            <MdDonutLarge />
          </button>
          <button title="Starred">
            <Star size={18} />
          </button>
        </div>
      </div>

      <div className="sidebar__bottom">
        <button title="Settings">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}

export default Sidebar;