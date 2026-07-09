// Node type catalog. Grouped for the palette; each type has an icon + accent color.
export const PALETTE_COLORS = [
  '#7c5cff', '#4dd0e1', '#43d19e', '#ffb454', '#ff5c7c',
  '#5b9dff', '#c084fc', '#f472b6', '#2dd4bf', '#a3e635', '#94a3b8',
];

export const GROUPS = [
  {
    id: 'client', title: 'クライアント', color: '#5b9dff',
    types: [
      { id: 'browser', label: 'Webブラウザ', icon: 'monitor', color: '#5b9dff' },
      { id: 'mobile', label: 'モバイル', icon: 'smartphone', color: '#5b9dff' },
      { id: 'user', label: 'ユーザー', icon: 'users', color: '#5b9dff' },
      { id: 'external-client', label: '外部システム', icon: 'external', color: '#94a3b8' },
    ],
  },
  {
    id: 'edge', title: 'ネットワーク / エッジ', color: '#4dd0e1',
    types: [
      { id: 'cdn', label: 'CDN', icon: 'cdn', color: '#4dd0e1' },
      { id: 'lb', label: 'ロードバランサ', icon: 'shuffle', color: '#4dd0e1' },
      { id: 'gateway', label: 'APIゲートウェイ', icon: 'gitbranch', color: '#4dd0e1' },
      { id: 'firewall', label: 'ファイアウォール', icon: 'shield', color: '#4dd0e1' },
      { id: 'dns', label: 'DNS', icon: 'globe', color: '#4dd0e1' },
    ],
  },
  {
    id: 'compute', title: 'コンピュート', color: '#7c5cff',
    types: [
      { id: 'web', label: 'Webサーバ', icon: 'server', color: '#7c5cff' },
      { id: 'app', label: 'APサーバ', icon: 'server', color: '#7c5cff' },
      { id: 'service', label: 'マイクロサービス', icon: 'box', color: '#7c5cff' },
      { id: 'container', label: 'コンテナ', icon: 'container', color: '#7c5cff' },
      { id: 'function', label: '関数 / Lambda', icon: 'zap', color: '#7c5cff' },
      { id: 'batch', label: 'バッチ', icon: 'cog', color: '#7c5cff' },
    ],
  },
  {
    id: 'data', title: 'データ', color: '#43d19e',
    types: [
      { id: 'db', label: 'DB (RDB)', icon: 'database', color: '#43d19e' },
      { id: 'nosql', label: 'NoSQL', icon: 'layers', color: '#43d19e' },
      { id: 'cache', label: 'キャッシュ', icon: 'zap', color: '#43d19e' },
      { id: 'storage', label: 'ストレージ', icon: 'bucket', color: '#43d19e' },
      { id: 'disk', label: 'ディスク', icon: 'harddrive', color: '#43d19e' },
      { id: 'dwh', label: 'DWH / 分析', icon: 'chart', color: '#43d19e' },
    ],
  },
  {
    id: 'integration', title: '連携 / 非同期', color: '#ffb454',
    types: [
      { id: 'queue', label: 'メッセージキュー', icon: 'queue', color: '#ffb454' },
      { id: 'api', label: 'REST / API', icon: 'api', color: '#ffb454' },
      { id: 'webhook', label: 'Webhook', icon: 'network', color: '#ffb454' },
      { id: 'mail', label: 'メール / 通知', icon: 'mail', color: '#ffb454' },
      { id: 'saas', label: 'SaaS / 外部API', icon: 'cloud', color: '#ffb454' },
    ],
  },
  {
    id: 'ops', title: 'セキュリティ / 運用', color: '#ff5c7c',
    types: [
      { id: 'auth', label: '認証 / IdP', icon: 'key', color: '#ff5c7c' },
      { id: 'secret', label: 'シークレット', icon: 'lock', color: '#ff5c7c' },
      { id: 'monitor', label: '監視', icon: 'activity', color: '#ff5c7c' },
      { id: 'log', label: 'ログ基盤', icon: 'file', color: '#ff5c7c' },
      { id: 'ai', label: 'AI / ML', icon: 'brain', color: '#c084fc' },
    ],
  },
  {
    id: 'misc', title: '汎用', color: '#94a3b8',
    types: [
      { id: 'group', label: 'グループ枠', icon: 'package', color: '#94a3b8', shape: 'group' },
      { id: 'note', label: 'ノート', icon: 'file', color: '#94a3b8' },
      { id: 'generic', label: '汎用ノード', icon: 'box', color: '#94a3b8' },
    ],
  },
];

// flat lookup: typeId -> {label, icon, color, groupTitle, shape}
export const TYPE_MAP = (() => {
  const m = {};
  for (const g of GROUPS) for (const t of g.types) m[t.id] = { ...t, groupTitle: g.title };
  return m;
})();

export function typeInfo(typeId) {
  return TYPE_MAP[typeId] || { id: typeId, label: typeId, icon: 'box', color: '#94a3b8' };
}
