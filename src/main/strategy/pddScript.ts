export type PddMessage = {
  sender: string;
  content: string;
  role: 'SELF' | 'OTHER' | 'SYSTEM' | '';
  type: 'TEXT';
};

export type PddSnapshot = {
  href: string;
  loggedIn: boolean;
  buyer: string;
  goods: string;
  goodsId: string;
  orderStatus: string;
  orderId: string;
  orderAmount: string;
  goodsSpec: string;
  logistics: string;
  messages: PddMessage[];
  sampleClasses: string[];
};

/**
 * Runs inside the Pinduoduo merchant page (and same-origin iframes).
 * Kept as a string so minification cannot split helpers out of the function
 * body that Chrome actually evaluates.
 */
export const READ_PDD_EXPRESSION = `(() => {
  const docs = [document];
  const frames = document.querySelectorAll('iframe');
  for (let i = 0; i < frames.length; i += 1) {
    try {
      if (frames[i].contentDocument) docs.push(frames[i].contentDocument);
    } catch (error) {}
  }

  const textOf = (el) => ((el && (el.innerText || el.textContent)) || '')
    .replace(/\\s+/g, ' ')
    .trim();

  const roleFrom = (el) => {
    let node = el;
    for (let depth = 0; node && depth < 5; depth += 1) {
      const blob = [
        node.className,
        node.id,
        node.getAttribute && node.getAttribute('class'),
        node.getAttribute && node.getAttribute('data-role'),
        node.getAttribute && node.getAttribute('aria-label'),
      ].filter(Boolean).join(' ').toLowerCase();
      if (/system|notice|tip|time-line|msg-time|timestamp/.test(blob)) {
        return 'SYSTEM';
      }
      if (/buyer|customer|user-msg|incoming|receive|left-msg|other/.test(blob)) {
        return 'OTHER';
      }
      if (/seller|merchant|service|self|outgoing|right-msg|cs-msg|assistant|mine/.test(blob)) {
        return 'SELF';
      }
      node = node.parentElement;
    }
    return '';
  };

  const selectors = [
    '[class*="msg-content"]',
    '[class*="message-content"]',
    '[class*="msgContent"]',
    '[class*="chat-message"]',
    '[class*="msg-item"]',
    '[class*="msgItem"]',
    '[class*="message-item"]',
  ];

  let messages = [];
  let sampleClasses = [];
  docs.forEach((doc) => {
    const nodes = [];
    selectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((node) => nodes.push(node));
    });
    const innermost = nodes.filter((node) => !nodes.some((other) => other !== node && node.contains(other)));
    innermost.forEach((node) => {
      const content = textOf(node);
      if (!content || content.length > 2000) return;
      messages.push({
        sender: '',
        content,
        role: roleFrom(node),
        type: 'TEXT',
      });
      const cls = String(node.className || '');
      if (cls && sampleClasses.length < 8) sampleClasses.push(cls.slice(0, 120));
    });
  });

  const seen = new Set();
  messages = messages.filter((msg) => {
    const key = msg.role + '|' + msg.content;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-30);

  const buyerSelectors = [
    '[class*="active"] [class*="nick"]',
    '[class*="active"] [class*="name"]',
    '[class*="current"] [class*="name"]',
    '[class*="session"][class*="active"]',
    '[class*="conversation"][class*="active"]',
  ];
  let buyer = '';
  docs.forEach((doc) => {
    if (buyer) return;
    for (let i = 0; i < buyerSelectors.length; i += 1) {
      const el = doc.querySelector(buyerSelectors[i]);
      const value = textOf(el).slice(0, 40);
      if (value) {
        buyer = value;
        return;
      }
    }
  });

  const labelValue = (label) => {
    let found = '';
    docs.forEach((doc) => {
      if (found) return;
      const nodes = doc.querySelectorAll('div, span, p, li, td');
      for (let i = 0; i < nodes.length && i < 400; i += 1) {
        const value = textOf(nodes[i]);
        if (value.indexOf(label) === 0 && value.length < 80) {
          found = value.slice(label.length).replace(/^[：:\\s]+/, '').slice(0, 80);
          return;
        }
      }
    });
    return found;
  };

  const href = String(location.href || '');
  const loggedIn = href.indexOf('login') === -1 && href.indexOf('passport') === -1;
  return {
    href,
    loggedIn,
    buyer,
    goods: labelValue('商品'),
    goodsId: labelValue('商品ID') || labelValue('商品编号'),
    orderStatus: labelValue('订单状态'),
    orderId: labelValue('订单编号') || labelValue('订单号'),
    orderAmount: labelValue('订单金额') || labelValue('实付'),
    goodsSpec: labelValue('商品规格') || labelValue('规格'),
    logistics: labelValue('物流'),
    messages,
    sampleClasses,
  };
})()`;

export const sendPddExpression = (text: string) => `(() => {
  const payload = ${JSON.stringify(text)};
  const docs = [document];
  const frames = document.querySelectorAll('iframe');
  for (let i = 0; i < frames.length; i += 1) {
    try {
      if (frames[i].contentDocument) docs.push(frames[i].contentDocument);
    } catch (error) {}
  }
  const inputSelectors = [
    'textarea',
    '[contenteditable="true"]',
    '[class*="reply"] [contenteditable]',
    '[class*="editor"] [contenteditable]',
  ];
  let input = null;
  let owner = null;
  for (let d = 0; d < docs.length && !input; d += 1) {
    for (let i = 0; i < inputSelectors.length; i += 1) {
      const found = docs[d].querySelector(inputSelectors[i]);
      if (found) {
        input = found;
        owner = docs[d];
        break;
      }
    }
  }
  if (!input || !owner) return { ok: false, reason: 'no-input' };
  input.focus();
  const tag = (input.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'INPUT') {
    const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(input, payload);
    else input.value = payload;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    input.textContent = payload;
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: payload,
      inputType: 'insertText',
    }));
  }
  const candidates = owner.querySelectorAll('button, [role="button"], span, div, a');
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i].innerText || candidates[i].textContent || '';
    const label = raw.replace(/\\s+/g, '').trim();
    if (label === '发送' || label === '发送(Enter)' || label === '发送（Enter）') {
      candidates[i].click();
      return { ok: true, reason: 'click' };
    }
  }
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
  }));
  return { ok: true, reason: 'enter' };
})()`;
