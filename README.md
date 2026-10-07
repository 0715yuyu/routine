# Routine

最低ラインで続ける習慣記録アプリ(PWA)。

## 特徴

- 習慣ごとに「通常ライン」と「最低ライン」を持ち、最低ラインでも達成扱いになる
- 休息日は連続記録を切らさない(未達とは別扱い)
- 完全ローカル。データは端末の IndexedDB のみ。通信は一切しない

## 開発

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/ に出力
```

## GitHub Pages への配信

1. GitHub に公開リポジトリを作る(例: `routine`)
2. ビルドする

```bash
BASE_PATH=/routine/ npm run build
```

3. `dist/` の中身をリポジトリの `gh-pages` ブランチ、または `docs/` に置いて push
4. リポジトリの Settings → Pages で公開元を指定

PWA は HTTPS でないとインストールできない。GitHub Pages は標準で HTTPS。

## iPhone への追加

1. Safari で公開 URL を開く(Chrome ではなく Safari であることが必須)
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面のアイコンから起動する

## 通知の代わり(iOS)

Web からは時刻指定の通知を出せない。「ショートカット」アプリで代用する。

1. ショートカット → オートメーション → 時刻
2. 希望の時刻、毎日、「すぐに実行」
3. アクションに「App を開く」でこのアプリを選ぶ

## バックアップ

**iOS は、1週間アプリを開かないと IndexedDB ごとデータを削除する。**
Safari の履歴消去でも消える。毎日使う前提なら起きにくいが、
ヘッダーの `↓` で JSON を書き出し、ときどき保存しておく。
`↑` で復元できる。

## 構成

```
src/
  models.ts        型と日付ユーティリティ
  streak.ts        連続記録の計算(純粋関数)
  db.ts            IndexedDB のスキーマ
  repository.ts    CRUD・集計・バックアップ
  ui/
    App.tsx        ホーム画面
    HabitCard.tsx  習慣カード
    WeekDots.tsx   今週のドット
    HabitEditor.tsx 作成・編集
```
