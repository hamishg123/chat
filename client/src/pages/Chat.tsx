import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  MessageSquare,
  Users,
  Send,
  Settings,
  LogOut,
  UserPlus,
  Check,
  X,
  Hash,
  Plus,
  Search,
  MessageCircle,
} from "lucide-react";

type SidebarTab = "chats" | "friends" | "add";

export default function Chat() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [selectedChatName, setSelectedChatName] = useState<string>("");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chats");

  if (!user) {
    setLocation("/auth");
    return null;
  }

  const conversationsQuery = trpc.messages.getConversations.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const friendsQuery = trpc.friends.getFriends.useQuery();
  const groupsQuery = trpc.groups.getMyGroups.useQuery();
  const pendingQuery = trpc.friends.getPendingRequests.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const pendingCount = pendingQuery.data?.length ?? 0;

  const handleSelectChat = (id: number, name: string) => {
    setSelectedChat(id);
    setSelectedChatName(name);
  };

  return (
    <div className="h-screen flex bg-[#0f0f13] text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 flex flex-col bg-[#16161f] border-r border-[#2a2a38]">
        {/* App Header */}
        <div className="px-4 py-4 border-b border-[#2a2a38]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 rounded-lg p-1.5">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg text-white">TopTier</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#2a2a38] rounded-lg"
                onClick={() => setLocation("/profile")}
                title="Profile Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-[#2a2a38] rounded-lg"
                onClick={logout}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Nav Tabs */}
        <div className="flex border-b border-[#2a2a38]">
          <button
            onClick={() => setSidebarTab("chats")}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              sidebarTab === "chats"
                ? "text-indigo-400 border-b-2 border-indigo-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setSidebarTab("friends")}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
              sidebarTab === "friends"
                ? "text-indigo-400 border-b-2 border-indigo-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Friends
            {pendingCount > 0 && (
              <span className="absolute top-2 right-3 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSidebarTab("add")}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              sidebarTab === "add"
                ? "text-indigo-400 border-b-2 border-indigo-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Add
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          {sidebarTab === "chats" && (
            <ChatsTab
              conversationsQuery={conversationsQuery}
              groupsQuery={groupsQuery}
              selectedChat={selectedChat}
              onSelectChat={handleSelectChat}
            />
          )}
          {sidebarTab === "friends" && (
            <FriendsTab
              friendsQuery={friendsQuery}
              pendingQuery={pendingQuery}
              selectedChat={selectedChat}
              onSelectChat={handleSelectChat}
            />
          )}
          {sidebarTab === "add" && (
            <AddFriendTab />
          )}
        </div>

        {/* User Profile Footer */}
        <div className="px-3 py-3 border-t border-[#2a2a38] bg-[#12121a]">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 ring-2 ring-indigo-500/30">
              <AvatarFallback className="bg-indigo-600 text-white text-xs font-bold">
                {(user as any)?.email?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {(user as any)?.email ?? "User"}
              </p>
              <p className="text-xs text-green-400">Online</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0f0f13]">
        {selectedChat ? (
          <ChatWindow chatId={selectedChat} chatName={selectedChatName} currentUserId={user.id} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function ChatsTab({ conversationsQuery, groupsQuery, selectedChat, onSelectChat }: any) {
  return (
    <div className="p-2 space-y-1">
      {/* DMs Section */}
      <div className="px-2 pt-3 pb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Direct Messages</p>
      </div>
      {conversationsQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      ) : conversationsQuery.data?.length > 0 ? (
        conversationsQuery.data.map((conv: any) => (
          <button
            key={conv.contactId}
            onClick={() => onSelectChat(conv.contactId, conv.contactDisplayName)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group ${
              selectedChat === conv.contactId
                ? "bg-indigo-600/20 border border-indigo-500/30"
                : "hover:bg-[#2a2a38]"
            }`}
          >
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarFallback className={`text-sm font-bold ${selectedChat === conv.contactId ? "bg-indigo-600 text-white" : "bg-[#2a2a38] text-gray-300"}`}>
                {conv.contactDisplayName?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${selectedChat === conv.contactId ? "text-indigo-300" : "text-gray-200"}`}>
                {conv.contactDisplayName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {conv.lastMessage || "No messages yet"}
              </p>
            </div>
          </button>
        ))
      ) : (
        <p className="text-xs text-gray-600 px-3 py-2">No conversations yet</p>
      )}

      {/* Groups Section */}
      <div className="px-2 pt-4 pb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Group Chats</p>
      </div>
      {groupsQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      ) : groupsQuery.data?.length > 0 ? (
        groupsQuery.data.map((group: any) => (
          <button
            key={group.id}
            onClick={() => onSelectChat(-group.id, group.name)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
              selectedChat === -group.id
                ? "bg-indigo-600/20 border border-indigo-500/30"
                : "hover:bg-[#2a2a38]"
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedChat === -group.id ? "bg-indigo-600" : "bg-[#2a2a38]"}`}>
              <Hash className="h-4 w-4 text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${selectedChat === -group.id ? "text-indigo-300" : "text-gray-200"}`}>
                {group.name}
              </p>
              <p className="text-xs text-gray-500">Group chat</p>
            </div>
          </button>
        ))
      ) : (
        <p className="text-xs text-gray-600 px-3 py-2">No groups yet</p>
      )}
    </div>
  );
}

function FriendsTab({ friendsQuery, pendingQuery, selectedChat, onSelectChat }: any) {
  const acceptRequestMutation = trpc.friends.acceptRequest.useMutation();
  const rejectRequestMutation = trpc.friends.rejectRequest.useMutation();
  const utils = trpc.useUtils();

  const handleAccept = async (requestId: number) => {
    try {
      await acceptRequestMutation.mutateAsync({ requestId });
      toast.success("Friend request accepted!");
      utils.friends.getPendingRequests.invalidate();
      utils.friends.getFriends.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to accept");
    }
  };

  const handleReject = async (requestId: number) => {
    try {
      await rejectRequestMutation.mutateAsync({ requestId });
      toast.success("Request rejected");
      utils.friends.getPendingRequests.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject");
    }
  };

  return (
    <div className="p-2 space-y-1">
      {/* Pending Requests */}
      {pendingQuery.data?.length > 0 && (
        <>
          <div className="px-2 pt-3 pb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Pending Requests
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {pendingQuery.data.length}
              </span>
            </p>
          </div>
          {pendingQuery.data.map((req: any) => (
            <div key={req.id} className="px-3 py-2.5 rounded-lg bg-[#1e1e2a] border border-[#2a2a38]">
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={req.senderAvatar} />
                  <AvatarFallback className="bg-purple-600 text-white text-xs">
                    {req.senderDisplayName?.charAt(0)?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{req.senderDisplayName}</p>
                  <p className="text-xs text-gray-500">@{req.senderHandle}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-7 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg"
                  onClick={() => handleAccept(req.id)}
                  disabled={acceptRequestMutation.isPending}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-7 text-gray-400 hover:text-red-400 hover:bg-red-500/10 text-xs rounded-lg"
                  onClick={() => handleReject(req.id)}
                  disabled={rejectRequestMutation.isPending}
                >
                  <X className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Friends List */}
      <div className="px-2 pt-3 pb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Friends</p>
      </div>
      {friendsQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      ) : friendsQuery.data?.length > 0 ? (
        friendsQuery.data.map((friend: any) => (
          <button
            key={friend.userId}
            onClick={() => onSelectChat(friend.userId, friend.displayName)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
              selectedChat === friend.userId
                ? "bg-indigo-600/20 border border-indigo-500/30"
                : "hover:bg-[#2a2a38]"
            }`}
          >
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={friend.avatar} />
              <AvatarFallback className="bg-emerald-600 text-white text-sm font-bold">
                {friend.displayName?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-200 truncate">{friend.displayName}</p>
              <p className="text-xs text-gray-500">@{friend.handle}</p>
            </div>
            <div className="flex-shrink-0">
              <span className="text-xs text-amber-500 font-medium">{friend.karma} ✦</span>
            </div>
          </button>
        ))
      ) : (
        <div className="text-center py-8 px-4">
          <Users className="h-8 w-8 text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No friends yet</p>
          <p className="text-xs text-gray-600 mt-1">Use the Add tab to find friends</p>
        </div>
      )}
    </div>
  );
}

function AddFriendTab() {
  const [searchHandle, setSearchHandle] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const utils = trpc.useUtils();

  const searchProfileQuery = trpc.profile.getByHandle.useQuery(
    { handle: searchHandle },
    { enabled: false }
  );
  const sendRequestMutation = trpc.friends.sendRequest.useMutation();

  const handleSearch = async () => {
    if (!searchHandle.trim()) {
      toast.error("Please enter a handle");
      return;
    }
    try {
      const result = await searchProfileQuery.refetch();
      if (result.data) setSearchResult(result.data);
      else { toast.error("User not found"); setSearchResult(null); }
    } catch {
      toast.error("User not found");
      setSearchResult(null);
    }
  };

  const handleSendRequest = async (recipientId: number) => {
    try {
      await sendRequestMutation.mutateAsync({ recipientId });
      toast.success("Friend request sent!");
      setSearchResult(null);
      setSearchHandle("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send request");
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="px-1 pt-2 pb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Find Friends</p>
      </div>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search by @handle"
          value={searchHandle}
          onChange={(e) => setSearchHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="bg-[#1a1a24] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 h-9 text-sm rounded-lg"
        />
        <Button
          onClick={handleSearch}
          disabled={searchProfileQuery.isFetching}
          className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3"
        >
          {searchProfileQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>

      {searchResult && (
        <div className="bg-[#1e1e2a] border border-indigo-500/30 rounded-xl p-3">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={searchResult.avatar} />
              <AvatarFallback className="bg-indigo-600 text-white font-bold">
                {searchResult.displayName?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">{searchResult.displayName}</p>
              <p className="text-xs text-gray-400">@{searchResult.handle}</p>
              {searchResult.bio && (
                <p className="text-xs text-gray-500 mt-1 truncate">{searchResult.bio}</p>
              )}
            </div>
          </div>
          <Button
            onClick={() => handleSendRequest(searchResult.userId)}
            disabled={sendRequestMutation.isPending}
            className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
          >
            {sendRequestMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Send Friend Request
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="bg-[#1a1a24] rounded-2xl p-6 mb-4 inline-block">
          <MessageSquare className="h-12 w-12 text-indigo-500 mx-auto" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No chat selected</h3>
        <p className="text-gray-500 text-sm max-w-xs">
          Choose a conversation from the sidebar or add a friend to get started
        </p>
      </div>
    </div>
  );
}

function ChatWindow({ chatId, chatName, currentUserId }: { chatId: number; chatName: string; currentUserId: number }) {
  const [message, setMessage] = useState("");
  const isGroup = chatId < 0;
  const actualChatId = Math.abs(chatId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dmHistoryQuery = !isGroup
    ? trpc.messages.getDMHistory.useQuery(
        { recipientId: actualChatId },
        { refetchInterval: 3000 }
      )
    : null;

  const groupMessagesQuery = isGroup
    ? trpc.groups.getMessages.useQuery(
        { groupId: actualChatId },
        { refetchInterval: 3000 }
      )
    : null;

  const sendDMMutation = trpc.messages.sendDM.useMutation();
  const sendGroupMessageMutation = trpc.groups.sendGroupMessage.useMutation();
  const utils = trpc.useUtils();

  const messages = isGroup ? groupMessagesQuery?.data : dmHistoryQuery?.data;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      if (isGroup) {
        await sendGroupMessageMutation.mutateAsync({ groupId: actualChatId, content: message });
        utils.groups.getMessages.invalidate({ groupId: actualChatId });
      } else {
        await sendDMMutation.mutateAsync({ recipientId: actualChatId, content: message });
        utils.messages.getDMHistory.invalidate({ recipientId: actualChatId });
        utils.messages.getConversations.invalidate();
      }
      setMessage("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send message");
    }
  };

  const isSending = sendDMMutation.isPending || sendGroupMessageMutation.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a2a38] bg-[#12121a]">
        <Avatar className="h-9 w-9">
          {isGroup ? (
            <AvatarFallback className="bg-[#2a2a38] text-gray-300">
              <Hash className="h-4 w-4" />
            </AvatarFallback>
          ) : (
            <AvatarFallback className="bg-indigo-600 text-white font-bold">
              {chatName?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          )}
        </Avatar>
        <div>
          <h2 className="font-semibold text-white">{chatName}</h2>
          <p className="text-xs text-gray-500">{isGroup ? "Group chat" : "Direct message"}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {(dmHistoryQuery?.isLoading || groupMessagesQuery?.isLoading) ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                {!isOwn && (
                  <Avatar className="h-7 w-7 flex-shrink-0 mb-1">
                    <AvatarFallback className="bg-[#2a2a38] text-gray-300 text-xs">
                      {msg.senderHandle?.charAt(0)?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[65%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  {isGroup && !isOwn && (
                    <span className="text-xs text-gray-500 px-1">@{msg.senderHandle}</span>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isOwn
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-[#1e1e2a] text-gray-100 rounded-bl-sm border border-[#2a2a38]"
                    }`}
                  >
                    {msg.type === "image" ? (
                      <img src={msg.imageUrl || ""} alt="Message" className="max-w-xs rounded-lg" />
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-600 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="bg-[#1a1a24] rounded-2xl p-4 mb-3">
              <MessageSquare className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-600 text-xs mt-1">Say hello to start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="px-4 py-4 border-t border-[#2a2a38] bg-[#12121a]">
        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
          <Input
            type="text"
            placeholder={`Message ${chatName}...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSending}
            className="flex-1 bg-[#1e1e2a] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 h-11 rounded-xl"
          />
          <Button
            type="submit"
            disabled={isSending || !message.trim()}
            className="h-11 w-11 p-0 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex-shrink-0 disabled:opacity-40"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
