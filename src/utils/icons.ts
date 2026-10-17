/**
 * 手绘线性图标（24×24，stroke = currentColor）。
 * 不依赖图标库，新增图标时保持 1.8 线宽、圆角端点的风格。
 */
const dot = (cx: number, cy: number, r = 1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`

export const ICONS = {
  // ── 分类：饮食 ──
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 7.5c0-1 1-1.5 1-2.5M12 7.5c0-1 1-1.5 1-2.5M16 7.5c0-1 1-1.5 1-2.5"/><path d="M9 21h6"/>',
  utensils: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18"/><path d="M18 21V3c-2.2 1.5-3.5 4-3.5 7.5V14H18"/>',
  cart: `<path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6.2"/>${dot(9.5, 20, 1.4)}${dot(17.5, 20, 1.4)}`,
  // ── 固定开销 ──
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.8-8.8M16.5 6.5l3 3M14 9l2 2"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3Z"/>',
  building:
    '<path d="M4.5 21V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V21"/><path d="M14.5 9h4a1 1 0 0 1 1 1v11"/><path d="M2.5 21h19"/><path d="M8 7.5h1M11 7.5h1M8 11h1M11 11h1M8 14.5h1M11 14.5h1M17 13h.5M17 16.5h.5"/><path d="M8.5 21v-3h2v3"/>',
  utilities:
    '<path d="M8 3.5c2.6 3.2 4 5.6 4 7.8a4 4 0 0 1-8 0c0-2.2 1.4-4.6 4-7.8Z"/><path d="M18.8 4 15 11.5h4.2L16.5 20"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6l1.5-8Z"/>',
  drop: '<path d="M12 3c3.6 4.4 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.4-6.6 6-11Z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  flame:
    '<path d="M12 21.5c-3.9 0-6.5-2.7-6.5-6.3 0-3.2 2-5.5 3.6-7.4.4 1.6 1.2 2.7 2.4 3.2.2-3 1.6-5.6 3.8-8.5.4 2.9 1.6 4.7 2.8 6.5 1 1.6 1.9 3.3 1.9 5.6 0 4-2.7 6.9-8 6.9Z"/><path d="M12 21.5c-1.7 0-2.8-1.2-2.8-2.7 0-1.6 1.2-2.7 2.8-4.3 1.6 1.6 2.8 2.7 2.8 4.3 0 1.5-1.1 2.7-2.8 2.7Z"/>',
  phone: `<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5.5h3"/>${dot(12, 18.2, 1.1)}`,
  car: '<path d="M5 17H3.5v-4.5L5.5 7h13l2 5.5V17H19"/><path d="M3.5 12.5h17M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  wifi: `<path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0"/>${dot(12, 19.5, 1.2)}`,
  // ── 交通 ──
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  train: `<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10.5h14M9 21l1.5-4M15 21l-1.5-4"/>${dot(9, 13.8)}${dot(15, 13.8)}`,
  bus: `<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 10.5h16M7 18v3M17 18v3M8 6.5h8"/>${dot(8, 14.3)}${dot(16, 14.3)}`,
  taxi: '<path d="M10 3.5h4V6"/><path d="M5 17H3.5v-4.5L5.5 7h13l2 5.5V17H19"/><path d="M3.5 12.5h17M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  parking: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M9.5 16.5v-9h3.2a2.8 2.8 0 0 1 0 5.6H9.5"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10"/><path d="M14 8h1.5a2 2 0 0 1 2 2v5.5a1.75 1.75 0 0 0 3.5 0V8.5L18 5.5"/>',
  etc: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><text x="12" y="14.6" text-anchor="middle" font-size="7.2" font-weight="800" font-family="-apple-system, Helvetica, Arial, sans-serif" fill="currentColor" stroke="none">ETC</text>',
  // ── 娱乐 ──
  ticket: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4Z"/><path d="M14.5 6v2.5M14.5 10.8v2.4M14.5 15.5V18"/>',
  plane: '<path d="M21.5 2.5 10.8 13.2"/><path d="M21.5 2.5 14.8 21.5l-4-8.3-8.3-4 19-6.7Z"/>',
  // ── 购物 ──
  bag: '<path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z"/><path d="M9 10.5V6.5a3 3 0 0 1 6 0v4"/>',
  package: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9M7.8 5.2l8.5 4.6"/>',
  store: '<path d="M4 10.5V20h16v-9.5"/><path d="M3 10.5 5 4h14l2 6.5Z"/><path d="M9.5 20v-5h5v5"/>',
  // ── 学习 ──
  book: '<path d="M5 19.5v-15A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6"/>',
  cap: '<path d="M2 9.5 12 5l10 4.5-10 4.5L2 9.5Z"/><path d="M6 11.5V16c3.5 2.5 8.5 2.5 12 0v-4.5M22 9.5v5"/>',
  pencil: '<path d="M15.5 3.5 20.5 8.5 9 20H4v-5L15.5 3.5Z"/><path d="m13 6 5 5"/>',
  // ── 保险 ──
  shield: '<path d="M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3Z"/>',
  shieldPlus: '<path d="M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3Z"/><path d="M12 9v6M9 12h6"/>',
  shieldCheck: '<path d="M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  file: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  // ── 医疗 ──
  medical: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/>',
  stethoscope: '<path d="M5 3v5a4 4 0 0 0 8 0V3"/><path d="M9 12v2.5a5 5 0 0 0 10 0V13"/><circle cx="19" cy="11" r="2"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7l-6 6Z"/><path d="m7 10 7 7"/>',
  // ── 其他 / 收入 ──
  sparkles: '<path d="M11 3.5 12.8 8.7 18 10.5l-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8L11 3.5Z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18"/>',
  laptop: '<rect x="5" y="4.5" width="14" height="10" rx="1.5"/><path d="M2.5 18.5h19l-1.5-4H4l-1.5 4Z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/><path d="M12 8C10.5 5 7.5 4 7 6s2.5 2 5 2c2.5 0 5.5 0 5-2s-3.5-1-5 2Z"/>',
  envelope: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M5 7.5c2 2 4.5 3 7 3s5-1 7-3"/><circle cx="12" cy="11" r="2"/>',

  // ── 自定义分类可选 ──
  coffee: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5M4 21h12"/>',
  paw: `${dot(5.5, 10, 1.8)}${dot(9, 5.8, 1.8)}${dot(15, 5.8, 1.8)}${dot(18.5, 10, 1.8)}<path d="M12 11c-3 0-5.5 3.5-5.5 6a2.5 2.5 0 0 0 3.5 2.3c1.3-.6 2.7-.6 4 0A2.5 2.5 0 0 0 17.5 17c0-2.5-2.5-6-5.5-6Z"/>`,
  gamepad: `<path d="M6 8h12a4 4 0 0 1 4 4v2a3.5 3.5 0 0 1-6.3 2.1L14.5 15h-5l-1.2 1.1A3.5 3.5 0 0 1 2 14v-2a4 4 0 0 1 4-4Z"/><path d="M7 10.5v3M5.5 12h3"/>${dot(15.5, 11.2)}${dot(17.8, 13)}`,
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 8.2 20 20M8.2 15.8 20 4"/>',
  shirt: '<path d="M8 3 3.5 5.5 5 10l2-.8V21h10V9.2l2 .8 1.5-4.5L16 3a4 4 0 0 1-8 0Z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  baby: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0M12 3c1.5 1 1.5 3 0 4"/>',

  // ── 界面 ──
  chart: '<path d="M21 12.5A9 9 0 1 1 11.5 3v9.5Z"/><path d="M15 3.3A9 9 0 0 1 20.7 9H15Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="m12 9 6 6M18 9l-6 6"/>',
  receipt: '<path d="M5 3h14v18l-2.5-1.8L14 21l-2-1.8L10 21l-2.5-1.8L5 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  wallet: `<path d="M18 7V5.5A1.5 1.5 0 0 0 16.5 4H6a2 2 0 0 0 0 4"/><path d="M4 6v12a2 2 0 0 0 2 2h14V8H6"/>${dot(16, 14, 1.3)}`,
  transfer: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7.5 9 6 9-6"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  swap: '<path d="M7 4 4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8"/>',
  party: '<path d="M4 20 8.5 7.5l8 8L4 20Z"/><path d="M14 4v2M19 9h2M17.5 5.5 19 4M12.5 8.5c1-1 1-2.5 0-3.5M15.5 11.5c1-1 2.5-1 3.5 0"/>',
} as const

export type IconName = keyof typeof ICONS
