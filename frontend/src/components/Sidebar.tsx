import React, { useEffect, useState } from 'react';
import { NewChatIcon, TrashIcon } from '@/components/Icons';
import { User, ChatSession } from '@/types';
import { fetchUserHistory, deleteChatSession } from '@/services/api';


interface SidebarProps {
  user: User;
  onNewChat: () => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  onSelectSession: (sessionId: string) => void;
  currentSessionId: string | null;
  onLogout: () => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenProfile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  user, onNewChat, isOpen, toggleSidebar, onSelectSession, currentSessionId, onLogout, onDeleteSession, onOpenProfile
}) => {
  const [history, setHistory] = useState<ChatSession[]>([]);

  // Group history by date
  const groupedHistory = (() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; sessions: ChatSession[] }[] = [
      { label: 'Today', sessions: [] },
      { label: 'Yesterday', sessions: [] },
      { label: 'Previous 7 Days', sessions: [] },
      { label: 'Older', sessions: [] }
    ];

    history.forEach(session => {
      const date = new Date(session.timestamp * 1000);
      if (date.toDateString() === today.toDateString()) {
        groups[0].sessions.push(session);
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups[1].sessions.push(session);
      } else if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        groups[2].sessions.push(session);
      } else {
        groups[3].sessions.push(session);
      }
    });

    return groups.filter(g => g.sessions.length > 0);
  })();

  useEffect(() => {
    if (user?.id) {
        fetchUserHistory(user.id).then(setHistory).catch((e) => {
          console.error("Failed to load history", e);
          setHistory([]);
        });
    }
  }, [user?.id, currentSessionId]); // Refresh when session changes

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if(!window.confirm("Delete this chat?")) return;
    
    try {
        await deleteChatSession(user.id, sessionId);
        // Optimistically update list
        setHistory(prev => prev.filter(s => s.id !== sessionId));
        // Notify parent to handle UI state if needed (e.g., if deleted active chat)
        onDeleteSession(sessionId);
    } catch (err) {
        console.error("Failed to delete session", err);
        alert("Failed to delete session. Please try again.");
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-30
        w-[260px] bg-charcoal-900 flex flex-col
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        border-r border-violet-900/30
      `}>
        {/* New Chat Button Area */}
        <div className="p-3 mb-2">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) toggleSidebar();
            }}
            className="flex items-center justify-between w-full px-4 py-3 rounded-lg hover:bg-charcoal-700 transition-colors group text-gray-200"
          >
            <div className="flex items-center gap-3">
              <div className="p-1 bg-violet-600 text-white rounded-full">
                  <NewChatIcon />
              </div>
              <span className="text-sm font-medium">New chat</span>
            </div>
            <NewChatIcon />
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
          {groupedHistory.length === 0 ? (
             <div className="text-center text-gray-600 text-xs mt-10">No chat history</div>
          ) : (
            groupedHistory.map((group) => (
              <div key={group.label} className="mb-6">
                <div className="text-xs font-semibold text-gray-500 px-2 mb-2">{group.label}</div>
                <div className="flex flex-col gap-1">
                  {group.sessions.map(session => (
                    <div 
                      key={session.id}
                      className={`group relative flex items-center rounded-lg transition-colors ${
                        currentSessionId === session.id 
                          ? 'bg-violet-900/30 text-white border border-violet-700/50' 
                          : 'text-gray-400 hover:bg-charcoal-700 hover:text-gray-200'
                      }`}
                    >
                        <button
                          onClick={() => {
                            onSelectSession(session.id);
                            if (window.innerWidth < 768) toggleSidebar();
                          }}
                          className="flex-1 text-left px-3 py-2.5 text-sm truncate pr-8"
                        >
                          {session.title || 'New Conversation'}
                        </button>
                        
                        {/* Delete Button */}
                        <button
                            onClick={(e) => handleDelete(e, session.id)}
                            className="absolute right-2 p-1 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-transparent"
                            title="Delete chat"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* User Profile / Footer */}
        <div className="p-3 border-t border-violet-900/30 space-y-2">
          <button 
            onClick={onOpenProfile}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-charcoal-700 transition-colors group"
            title="View profile"
          >
            <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs uppercase">
               {user.name.charAt(0)}
            </div>
            <div className="flex flex-col items-start text-sm overflow-hidden">
              <span className="font-semibold text-gray-200 truncate w-full text-left">{user.name}</span>
              <span className="text-gray-500 text-xs truncate">Open profile</span>
            </div>
          </button>

          <button 
            onClick={onLogout}
            className="w-full px-3 py-2 rounded-lg bg-charcoal-800 hover:bg-charcoal-700 text-sm text-gray-300"
            title="Logout"
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
