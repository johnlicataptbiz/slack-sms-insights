/**
 * ConversationList.tsx - Conversation selection and filtering UI
 */

import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UseInboxStateReturn } from "@/v2/hooks/useInboxState";

interface Conversation {
  id: string;
  senderPhone: string;
  senderName?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  status: "open" | "closed" | "dnc";
  owner?: string;
  needsReply?: boolean;
  unreadCount?: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  state: UseInboxStateReturn;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  state,
}) => {
  // Filter conversations based on state
  const filteredConversations = useMemo(() => {
    let result = conversations;

    // Status filter
    if (state.filters.statusFilter !== "all") {
      result = result.filter((c) => c.status === state.filters.statusFilter);
    }

    // Needs reply filter
    if (state.filters.needsReplyOnly) {
      result = result.filter((c) => c.needsReply);
    }

    // Owner filter
    if (state.filters.ownerFilter) {
      result = result.filter((c) =>
        (c.owner || "unassigned").includes(state.filters.ownerFilter!),
      );
    }

    // Search filter
    if (state.filters.search) {
      const search = state.filters.search.toLowerCase();
      result = result.filter((c) =>
        (c.senderPhone + (c.senderName || "") + (c.lastMessage || ""))
          .toLowerCase()
          .includes(search),
      );
    }

    return result;
  }, [conversations, state.filters]);

  // Sort conversations
  const sortedConversations = useMemo(() => {
    const sorted = [...filteredConversations];
    switch (state.filters.sortMode) {
      case "oldest":
        return sorted.sort(
          (a, b) => (a.lastMessageTime || 0) - (b.lastMessageTime || 0),
        );
      case "urgent":
        return sorted.sort((a, b) => {
          const aUrgent = a.needsReply ? 1 : 0;
          const bUrgent = b.needsReply ? 1 : 0;
          return (
            bUrgent - aUrgent ||
            (b.lastMessageTime || 0) - (a.lastMessageTime || 0)
          );
        });
      case "needs_reply":
        return sorted.filter((c) => c.needsReply);
      case "recent":
      default:
        return sorted.sort(
          (a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0),
        );
    }
  }, [filteredConversations, state.filters.sortMode]);

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Search and filters */}
      <div className="space-y-2 border-b p-2">
        <Input
          type="search"
          placeholder="Search by phone, name..."
          value={state.filters.search}
          onChange={(e) => state.updateFilters({ search: e.target.value })}
          className="h-8"
        />

        {/* Filter buttons */}
        <div className="flex flex-wrap gap-1">
          {["all", "open", "closed", "dnc"].map((status) => (
            <Button
              key={status}
              size="sm"
              variant={
                state.filters.statusFilter === status ? "default" : "outline"
              }
              onClick={() =>
                state.updateFilters({
                  statusFilter: status as "all" | "open" | "closed" | "dnc",
                })
              }
            >
              {status}
            </Button>
          ))}
        </div>

        {/* Sort and options */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={state.filters.needsReplyOnly ? "default" : "outline"}
            onClick={() =>
              state.updateFilters({
                needsReplyOnly: !state.filters.needsReplyOnly,
              })
            }
          >
            💬 Needs Reply
          </Button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto space-y-1 p-2">
        {sortedConversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No conversations found
          </div>
        ) : (
          sortedConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => state.selectConversation(conv.id)}
              className={cn(
                "w-full text-left rounded p-2 hover:bg-muted transition-colors",
                state.uiState.selectedConversationId === conv.id &&
                  "bg-blue-100 dark:bg-blue-900",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {conv.senderName || conv.senderPhone}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {conv.lastMessage}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {conv.unreadCount! > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {conv.unreadCount}
                    </Badge>
                  )}
                  {conv.needsReply && (
                    <Badge variant="outline" className="text-xs">
                      💬
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Status: {conv.status} • {conv.owner || "Unassigned"}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ConversationList;
