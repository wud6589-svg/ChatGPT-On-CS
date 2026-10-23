import { MacPlatform } from './platforms';
import { PddSnapshot } from './pddScript';

export type ChatMessage = {
  sender: string;
  content: string;
  role: 'SELF' | 'OTHER' | 'SYSTEM';
  type: 'TEXT';
};

export type ReplyResult = {
  type?: string;
  content?: string;
  error?: string;
};

/**
 * The Windows worker splits outgoing text. `twkey` starts a new bubble.
 * `twcount` is the max characters per bubble (0 disables the length split).
 */
export function splitReply(content: string, key: string, count: number): string[] {
  const pieces = key ? content.split(key) : [content];
  const out: string[] = [];
  pieces.forEach((piece) => {
    const text = piece.replace(/^\s+|\s+$/g, '');
    if (!text) {
      return;
    }
    if (!count || count <= 0 || text.length <= count) {
      out.push(text);
      return;
    }
    for (let index = 0; index < text.length; index += count) {
      out.push(text.slice(index, index + count));
    }
  });
  return out;
}

export function snapshotToPayload(
  platform: MacPlatform,
  taskId: string,
  snapshot: PddSnapshot,
): { ctx: Record<string, string | boolean>; msgs: ChatMessage[] } | null {
  const msgs: ChatMessage[] = [];
  snapshot.messages.forEach((message) => {
    if (message.role !== 'SELF' && message.role !== 'OTHER' && message.role !== 'SYSTEM') {
      return;
    }
    if (!message.content) {
      return;
    }
    msgs.push({
      sender:
        message.sender ||
        (message.role === 'OTHER' ? snapshot.buyer || '顾客' : '客服'),
      content: message.content,
      role: message.role,
      type: 'TEXT',
    });
  });
  if (msgs.length === 0) {
    return null;
  }
  const lastCustomer = [...msgs].reverse().find((message) => message.role === 'OTHER');
  if (!lastCustomer) {
    return null;
  }
  const ctx: Record<string, string | boolean> = {
    CTX_APP_NAME: platform.name,
    CTX_APP_ID: platform.id,
    CTX_INSTANCE_ID: taskId,
    CTX_USERNAME: snapshot.buyer || '顾客',
    CTX_PLATFORM: platform.name,
    CTX_HAS_NEW_MESSAGE: true,
    CTX_HAS_GROUP_MESSAGE: false,
  };
  const extras: Array<[string, string]> = [
    ['CTX_CURRENT_GOODS', snapshot.goods],
    ['CTX_CURRENT_GOODS_ID', snapshot.goodsId],
    ['CTX_ORDER_STATUS', snapshot.orderStatus],
    ['CTX_ORDER_ID', snapshot.orderId],
    ['CTX_ORDER_AMOUNT', snapshot.orderAmount],
    ['CTX_GOODS_SPEC', snapshot.goodsSpec],
    ['CTX_LOGISTICS_STATUS', snapshot.logistics],
  ];
  extras.forEach(([key, value]) => {
    if (value) {
      ctx[key] = value;
    }
  });
  return { ctx, msgs: msgs.slice(-20) };
}

export function dedupKey(taskId: string, snapshot: PddSnapshot): string {
  const last = [...snapshot.messages].reverse().find((message) => message.role === 'OTHER');
  return `${taskId}|${snapshot.buyer}|${last ? last.content : ''}`;
}
