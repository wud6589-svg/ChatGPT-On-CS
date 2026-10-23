export type MacPlatform = {
  id: string;
  name: string;
  type: string;
  /** `desktop` shows the existing "open the native app first" badge. */
  env: 'browser' | 'desktop';
  desc: string;
  /** Empty when macOS has no web workbench to open. */
  url: string;
  /** Automatic read/reply is implemented for the Pinduoduo web workbench. */
  autoReply: boolean;
};

const PDD_URL = 'https://mms.pinduoduo.com/chat-merchant/index.html';
const QIANNIU_URL = 'https://myseller.taobao.com/home.htm';
const DOUDIAN_URL = 'https://im.jinritemai.com/pc_seller_v2/main';
const JINGMAI_URL = 'https://shop.jd.com/';

const WEB_LIMIT =
  'Mac 用独立 Chrome 配置打开这个网页。自动回复目前只接了拼多多商家工作台，其它平台请先登录后手动接待。';

const DESKTOP_LIMIT =
  '这是桌面客户端。请在 Mac 上先打开对应 App。Windows 的界面自动化程序不能在 macOS 上运行。';

/**
 * Ids `pinduoduo` and `win_qianniu` match the ids already referenced by the
 * keyword editor. The Windows strategy binary is closed source, so the rest
 * of the catalog uses stable ids for the platforms named in the README.
 */
export const MAC_PLATFORMS: MacPlatform[] = [
  {
    id: 'pinduoduo',
    name: '拼多多',
    type: 'E_COMMERCE',
    env: 'browser',
    url: PDD_URL,
    autoReply: true,
    desc: '在 Mac 上新增客服后，会用本机 Chrome 打开拼多多商家客服工作台。登录店铺，再点首页的开启自动回复。',
  },
  {
    id: 'win_qianniu',
    name: '千牛',
    type: 'E_COMMERCE',
    env: 'browser',
    url: QIANNIU_URL,
    autoReply: false,
    desc: `千牛在 Mac 上打开淘宝卖家中心（${QIANNIU_URL}）。${WEB_LIMIT}`,
  },
  {
    id: 'taobao',
    name: '淘宝',
    type: 'E_COMMERCE',
    env: 'browser',
    url: QIANNIU_URL,
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'doudian',
    name: '抖店',
    type: 'E_COMMERCE',
    env: 'browser',
    url: DOUDIAN_URL,
    autoReply: false,
    desc: `抖店/飞鸽工作台。${WEB_LIMIT}`,
  },
  {
    id: 'jingmai',
    name: '京麦',
    type: 'E_COMMERCE',
    env: 'browser',
    url: JINGMAI_URL,
    autoReply: false,
    desc: `京东商家后台。${WEB_LIMIT}`,
  },
  {
    id: 'wechat',
    name: '微信',
    type: 'HOT',
    env: 'desktop',
    url: '',
    autoReply: false,
    desc: DESKTOP_LIMIT,
  },
  {
    id: 'wecom',
    name: '企业微信',
    type: 'OTHER',
    env: 'desktop',
    url: '',
    autoReply: false,
    desc: DESKTOP_LIMIT,
  },
  {
    id: 'douyin',
    name: '抖音',
    type: 'ME_MEDIA',
    env: 'browser',
    url: 'https://www.douyin.com/',
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'douyin_enterprise',
    name: '抖音企业号',
    type: 'ME_MEDIA',
    env: 'browser',
    url: 'https://e.douyin.com/',
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    type: 'ME_MEDIA',
    env: 'browser',
    url: 'https://www.xiaohongshu.com/',
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'xiaohongshu_pro',
    name: '小红书专业号',
    type: 'ME_MEDIA',
    env: 'browser',
    url: 'https://pro.xiaohongshu.com/',
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    type: 'ME_MEDIA',
    env: 'browser',
    url: 'https://message.bilibili.com/',
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'weibo',
    name: '微博',
    type: 'ME_MEDIA',
    env: 'browser',
    url: 'https://weibo.com/message',
    autoReply: false,
    desc: WEB_LIMIT,
  },
  {
    id: 'zhihu',
    name: '知乎',
    type: 'OTHER',
    env: 'browser',
    url: 'https://www.zhihu.com/messages',
    autoReply: false,
    desc: WEB_LIMIT,
  },
];

export function findPlatform(appId: string): MacPlatform | undefined {
  return MAC_PLATFORMS.find((platform) => platform.id === appId);
}

export function wirePlatforms() {
  return MAC_PLATFORMS.map((platform) => ({
    id: platform.id,
    name: platform.name,
    type: platform.type,
    env: platform.env,
    desc: platform.desc,
  }));
}
