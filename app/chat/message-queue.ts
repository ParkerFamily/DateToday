/**
 * Optimistic message queue for chat
 * Handles rapid message sending with proper state management
 */

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type OptimisticMessage = {
  clientId: string;
  text: string;
  status: MessageStatus;
  createdAt: Date;
  serverId?: string;
  error?: string;
};

export type MessageWithStatus = {
  id: string;
  senderId: string;
  type: 'text' | 'date_proposal';
  text?: string;
  proposal?: any;
  status?: MessageStatus | 'proposed' | 'accepted' | 'declined';
  respondedBy?: string;
  createdAt: Date | null;
  clientId?: string;
  isOptimistic?: boolean;
};

/**
 * Generate a unique client-side message ID
 */
export function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Merge optimistic and real messages, deduplicating by ID
 */
export function mergeMessages(
  realMessages: any[],
  optimisticMessages: OptimisticMessage[],
  userId: string,
): MessageWithStatus[] {
  const serverIdToClientId = new Map<string, string>();
  
  // Map server IDs to client IDs from optimistic messages
  optimisticMessages.forEach(opt => {
    if (opt.serverId) {
      serverIdToClientId.set(opt.serverId, opt.clientId);
    }
  });
  
  // Convert real messages
  const realMapped: MessageWithStatus[] = realMessages.map(msg => ({
    ...msg,
    clientId: serverIdToClientId.get(msg.id),
    isOptimistic: false,
  }));
  
  // Get client IDs that are already in real messages
  const confirmedClientIds = new Set(
    realMapped.map(m => m.clientId).filter((id): id is string => Boolean(id))
  );
  
  // Add optimistic messages that haven't been confirmed yet
  const optimisticMapped: MessageWithStatus[] = optimisticMessages
    .filter(opt => !confirmedClientIds.has(opt.clientId) && !opt.serverId)
    .map(opt => ({
      id: opt.clientId,
      senderId: userId,
      type: 'text' as const,
      text: opt.text,
      status: opt.status,
      createdAt: opt.createdAt,
      clientId: opt.clientId,
      isOptimistic: true,
    }));
  
  // Merge and sort by createdAt
  const all = [...realMapped, ...optimisticMapped];
  all.sort((a, b) => {
    const aTime = a.createdAt?.getTime() ?? 0;
    const bTime = b.createdAt?.getTime() ?? 0;
    return aTime - bTime;
  });
  
  return all;
}

/**
 * Log message lifecycle events for debugging
 */
export function logMessageEvent(event: string, data: any) {
  const timestamp = new Date().toISOString();
  console.log(`[MessageQueue ${timestamp}] ${event}:`, data);
}
