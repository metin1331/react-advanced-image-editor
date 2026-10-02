import type { ImageEditorLocale } from 'react-advanced-image-editor';

export type SiteCopy = {
  tagline: string;
  kicker: string;
  headline: string;
  lead: string;
  placement: string;
  modal: string;
  inline: string;
  preset: string;
  afterExport: string;
  preview: string;
  onPage: string;
  language: string;
  switchDark: string;
  switchLight: string;
  addPhoto: string;
  fileHint: string;
  chooseImage: string;
  reopen: string;
  builtBy: string;
  footerBlurb: string;
};

export const siteCopy: Record<ImageEditorLocale, SiteCopy> = {
  en: {
    tagline: 'Crop, edit, markup, and more',
    kicker: 'Playground',
    headline: 'A photo editor you can drop into a page.',
    lead: "Pick a file, adjust the crop, then export. The editor follows this page's light or dark setting. Built-in multilingual support, with English as the default.",
    placement: 'Placement',
    modal: 'Modal',
    inline: 'Inside page',
    preset: 'Preset',
    afterExport: 'After export',
    preview: 'Preview',
    onPage: 'On page',
    language: 'Language',
    switchDark: 'Switch to dark',
    switchLight: 'Switch to light',
    addPhoto: 'Add a photo',
    fileHint: 'JPEG, PNG, WebP, or HEIC from your device.',
    chooseImage: 'Choose image',
    reopen: 'Reopen',
    builtBy: 'Built by',
    footerBlurb:
      'Advanced Image Editor — Modern, advanced, and responsive image editing component for React',
  },
  tr: {
    tagline: 'Kırp, düzenle, işaretle ve daha fazlası',
    kicker: 'Deneme alanı',
    headline: 'Sayfaya bırakabileceğin bir fotoğraf editörü.',
    lead: 'Bir dosya seç, kırpmayı ayarla, sonra dışa aktar. Editör bu sayfanın açık veya koyu ayarını izler. İngilizce varsayılan olmak üzere yerleşik çoklu dil desteği.',
    placement: 'Yerleşim',
    modal: 'Modal',
    inline: 'Sayfanın içinde',
    preset: 'Preset',
    afterExport: 'Dışa aktarma',
    preview: 'Önizleme',
    onPage: 'Sayfada',
    language: 'Dil',
    switchDark: 'Koyu temaya geç',
    switchLight: 'Açık temaya geç',
    addPhoto: 'Fotoğraf ekle',
    fileHint: 'Cihazından JPEG, PNG, WebP veya HEIC.',
    chooseImage: 'Resim seç',
    reopen: 'Yeniden aç',
    builtBy: 'Geliştiren',
    footerBlurb:
      'Advanced Image Editor — React için modern, gelişmiş ve duyarlı görüntü düzenleme bileşeni',
  },
  jp: {
    tagline: '切り抜き、編集、マークアップ、その他',
    kicker: 'プレイグラウンド',
    headline: 'ページに置ける写真エディター。',
    lead: 'ファイルを選び、切り抜いて、書き出します。エディターはこのページのライト／ダーク設定に従います。言語はライブラリに内蔵されていて、初期値は英語です。ヘッダーの切り替えでエディターも変わります。',
    placement: '配置',
    modal: 'モーダル',
    inline: 'ページ内',
    preset: 'プリセット',
    afterExport: '書き出し後',
    preview: 'プレビュー',
    onPage: 'ページ上',
    language: '言語',
    switchDark: 'ダークに切り替え',
    switchLight: 'ライトに切り替え',
    addPhoto: '写真を追加',
    fileHint: '端末の JPEG、PNG、WebP、HEIC。',
    chooseImage: '画像を選択',
    reopen: '再度開く',
    builtBy: '開発',
    footerBlurb:
      'Advanced Image Editor — React向けのモダンで高度、レスポンシブな画像編集コンポーネント',
  },
};
