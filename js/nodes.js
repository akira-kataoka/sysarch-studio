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
    id: 'layout', title: 'レイアウト / ゾーン', color: '#5b9dff',
    types: [
      { id: 'banner', label: 'タイトル', icon: 'file', color: '#4d8dff', shape: 'banner' },
      { id: 'zone', label: 'ゾーン枠', icon: 'package', color: '#5b9dff', shape: 'group' },
      { id: 'dept', label: '部門ボックス', icon: 'package', color: '#7c5cff', shape: 'group' },
      { id: 'band', label: '背景バンド', icon: 'layers', color: '#4dd0e1', shape: 'band' },
      { id: 'step', label: '処理ボックス', icon: 'box', color: '#94a3b8', shape: 'plain' },
      { id: 'group', label: 'グループ枠', icon: 'package', color: '#94a3b8', shape: 'group' },
      { id: 'generic', label: '汎用ノード', icon: 'box', color: '#94a3b8' },
    ],
  },
  {
    // brand-colored tiles that render the service's initials — NOT logo reproductions
    id: 'brand', title: 'サービス / ロゴタイル', color: '#00A1E0',
    types: [
      { id: 'salesforce', label: 'Salesforce', color: '#00A1E0', logo: true },
      { id: 'slack', label: 'Slack', color: '#611f69', logo: true },
      { id: 'zoom', label: 'Zoom', color: '#2D8CFF', logo: true },
      { id: 'google', label: 'Google', color: '#4285F4', logo: true },
      { id: 'gmail', label: 'Gmail', color: '#EA4335', logo: true },
      { id: 'gdrive', label: 'Google Drive', color: '#1FA463', logo: true },
      { id: 'microsoft', label: 'Microsoft', color: '#0078D4', logo: true },
      { id: 'teams', label: 'Teams', color: '#4B53BC', logo: true },
      { id: 'aws', label: 'AWS', color: '#E8850C', logo: true },
      { id: 'azure', label: 'Azure', color: '#008AD7', logo: true },
      { id: 'github', label: 'GitHub', color: '#24292E', logo: true },
      { id: 'notion', label: 'Notion', color: '#33302E', logo: true },
      { id: 'tableau', label: 'Tableau', color: '#E8762C', logo: true },
      { id: 'freee', label: 'freee', color: '#007BE0', logo: true },
      { id: 'docusign', label: 'DocuSign', color: '#C99700', logo: true },
      { id: 'dropbox', label: 'Dropbox', color: '#0061FF', logo: true },
      { id: 'stripe', label: 'Stripe', color: '#635BFF', logo: true },
      { id: 'chatwork', label: 'Chatwork', color: '#E9531F', logo: true },
      { id: 'smarthr', label: 'SmartHR', color: '#00A0B0', logo: true },
      { id: 'custom-logo', label: 'サービス', color: '#5b9dff', logo: true },
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
