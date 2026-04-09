# サインアップアプリ

[English](README.en.md)

Google Apps ScriptとGoogle Sheetsで構築した、無料のオープンソースボランティア募集アプリです。日本の学校のイベントのボランティア募集を想定して作成しました。

---

## 主な機能

- グリッド表示 — 横軸に活動、縦軸に時間帯
- 時間帯の範囲表示（例：9:00 am - 10:00 am）
- 3つのボランティア役割 — 一般、クラス委員、役員（名称変更可能）
- 役割ごとの定員管理 — 役割ごとに独自の定員を設定
- 定員が0の役割は自動的に非表示
- 役割ごとのカラーコード — 緑（一般）、琥珀（クラス委員）、青（役員）
- 名前とクラスで申込み — Googleアカウント不要
- 申込みモーダルで役割ごとに名前をグループ表示
- サーバーサイドで定員管理（競合状態の防止）
- 同一スロット内での名前の重複防止
- 活動列ごとに担当者を表示
- 時間帯ごとのメモ・説明欄
- Google Sheetの名前がページタイトルに自動反映
- URLパラメータで複数イベントに対応 — 再デプロイ不要
- モバイル対応 — モーダルポップアップで申込み
- Unicode完全対応 — あらゆる言語をサポート
- データはGoogle Sheetsに保存 — 管理が簡単
- 無料 — Googleアカウントがあればホスティング費用不要

---

## 仕組み

```
マスター管理シート（Configタブ）
      ↓ エイリアスの照合
イベント用Google Sheet（EventsタブとSignupsタブ）
      ↓
Google Apps Script（バックエンド＋Webサーバー）
      ↓
公開Webアプリ（ユーザーのログイン不要）
```

管理者はGoogle Sheetsでイベントを直接管理します。ユーザーはイベントのエイリアスパラメータ付きURLにアクセスし、空きスロットを確認して名前とクラスを入力して申し込みます。すべてのデータはリアルタイムでイベントのGoogle Sheetに書き込まれます。

---

## 必要なもの

- Googleアカウント
- [Node.js](https://nodejs.org)（LTSバージョン）
- [CLASP](https://github.com/google/clasp) — GoogleのApps Script CLI
- [VS Code](https://code.visualstudio.com) またはその他のテキストエディタ
- Git（バージョン管理用、任意）

---

## セットアップ手順

### ステップ1 — マスター管理シートの作成

1. [sheets.google.com](https://sheets.google.com) で新しいスプレッドシートを作成
2. 任意の名前をつける（例：**サインアップアプリ管理**）
3. **Config** というタブを作成（大文字のCで始まること）
4. 1行目にヘッダーを追加：

| A           | B        |
| ----------- | -------- |
| Event Alias | Sheet ID |

5. URLからSheet IDを確認：

```
https://docs.google.com/spreadsheets/d/YOUR_MASTER_SHEET_ID/edit
```

6. 共有設定を**制限付き**に設定 — 編集できるのは管理者のみ

### ステップ2 — イベントシートの作成

1. 新しいスプレッドシートを作成（または既存のものを複製）
2. 任意の名前をつける — この名前がアプリのページタイトルになります
3. 2つのタブを作成：

**Eventsタブ** — 1行目にヘッダーを追加：

| A       | B        | C      | D    | E         | F       | G           | H        | I            | J             | K              |
| ------- | -------- | ------ | ---- | --------- | ------- | ----------- | -------- | ------------ | ------------- | -------------- |
| EventID | Activity | Person | Date | StartTime | EndTime | Description | Location | GeneralSlots | ClassRepSlots | CommitteeSlots |

**Signupsタブ** — 1行目にヘッダーを追加：

| A        | B       | C    | D     | E    | F         |
| -------- | ------- | ---- | ----- | ---- | --------- |
| SignupID | EventID | Name | Class | Role | Timestamp |

4. Eventsタブにイベントデータを入力。不要な役割のスロット数は`0`に設定。
5. URLからSheet IDを確認。
6. 共有設定を**制限付き**に設定。

### ステップ3 — ConfigタブへのイベントIDの登録

1. **マスター管理シート** → **Configタブ** を開く
2. 新しい行を追加：

| Event Alias | Sheet ID            |
| ----------- | ------------------- |
| myevent     | YOUR_EVENT_SHEET_ID |

### ステップ4 — Apps Script APIの有効化

[script.google.com/home/usersettings](https://script.google.com/home/usersettings) にアクセスし、**Google Apps Script API** をオンにする。

### ステップ5 — CLASPのインストール

```bash
npm install -g @google/clasp
clasp login
```

### ステップ6 — リポジトリのクローン

```bash
git clone https://github.com/YOURUSERNAME/signup-app.git
cd signup-app
```

### ステップ7 — Apps Scriptプロジェクトの作成

```bash
clasp create --title "Signup App"
```

### ステップ8 — スクリプトの設定

`Code.gs` を開き、先頭の2つの定数を更新：

```javascript
const MASTER_SHEET_ID = "YOUR_MASTER_SHEET_ID_HERE";

const ROLES = {
  general: "一般",
  classRep: "クラス代表",
  committee: "委員会",
};
```

### ステップ9 — コードのプッシュ

```bash
clasp push
```

### ステップ10 — Webアプリとしてデプロイ

1. [script.google.com](https://script.google.com) でサインアップアプリのプロジェクトを開く
2. **デプロイ** → **新しいデプロイ** をクリック
3. 歯車アイコン → **ウェブアプリ** を選択
4. 以下を設定：
   - **次のユーザーとして実行：** 自分
   - **アクセスできるユーザー：** 全員
5. **デプロイ** をクリック
6. 権限の承認を求められたら許可
7. `/exec` で終わるWebアプリのURLをコピー
8. 今後の再デプロイのために**デプロイメントID**をメモ

---

## イベントリンクの共有

各イベントは`?event=`パラメータを使った独自URLを持ちます：

```
https://script.google.com/.../exec?event=myevent
```

URLのエイリアスはConfigタブの**Event Alias**列と完全に一致している必要があります（大文字・小文字は区別しません）。

パラメータなしでURLにアクセスした場合は「イベントが指定されていません」というメッセージが表示されます。

---

## イベントの管理

### 新しいイベントの追加

1. Google Driveで既存のイベントシートを複製
2. データ行をクリア（ヘッダーは残す）
3. シート名を更新 — これがページタイトルになります
4. 新しいSheet IDをメモ
5. **マスター管理シート** → **Configタブ** を開く
6. エイリアスとSheet IDの新しい行を追加
7. 新しいURLをユーザーと共有 — 再デプロイ不要

### イベントの編集

該当するシートの**Eventsタブ**の行を直接編集します。変更は次のページ読み込み時に反映されます。

### イベントの削除

**Configタブ**から行を削除するとイベントURLはすぐに無効になります。必要に応じてGoogle DriveからイベントシートをDeleteしてください。

### 申込み状況の確認

各イベントシートの**Signupsタブ**に以下の情報が記録されています：

- 申込みID
- イベントID
- 参加者氏名
- 参加者クラス
- 役割（一般 / クラス代表 / 委員会）
- タイムスタンプ

---

## Eventsタブの列の説明

| 列  | フィールド     | 説明                                    |
| --- | -------------- | --------------------------------------- |
| A   | EventID        | 行ごとのユニークな番号（例：1、2、3）   |
| B   | Activity       | 活動名 — グリッドの列ヘッダーとして表示 |
| C   | Person         | 担当者名 — 活動名の下に表示             |
| D   | Date           | 日付（YYYY-MM-DD形式）                  |
| E   | StartTime      | 開始時刻（HH:MM形式、例：09:00）        |
| F   | EndTime        | 終了時刻（HH:MM形式、例：10:00）        |
| G   | Description    | グリッドに表示する短いメモ              |
| H   | Location       | 部屋または場所名                        |
| I   | GeneralSlots   | 一般ボランティアの最大定員（0=不要）    |
| J   | ClassRepSlots  | クラス代表の最大定員（0=不要）          |
| K   | CommitteeSlots | 委員会の最大定員（0=不要）              |

---

## カスタマイズ

### 役割名の変更

`Code.gs`の`ROLES`定数を更新：

```javascript
const ROLES = {
  general: "ボランティア",
  classRep: "チームリーダー",
  committee: "コーディネーター",
};
```

キー（`general`、`classRep`、`committee`）はそのままにして、右側の値のみ変更してください。再デプロイ後、すべての箇所に自動的に反映されます。

### 役割カラーの変更

`index.html`のCSSを更新：

```css
.count-general {
  color: #2e7d32;
} /* 緑 */
.count-classrep {
  color: #f57f17;
} /* 琥珀 */
.count-committee {
  color: #1565c0;
} /* 青 */
```

### ボタンテキストの変更

`index.html`の`<script>`ブロックの先頭：

```javascript
var SIGNUP_BTN_TEXT = "申し込む";
```

### タイムゾーンの変更

`appsscript.json`：

```json
{
  "timeZone": "Asia/Tokyo"
}
```

タイムゾーン文字列の一覧は[タイムゾーンデータベースの一覧](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)を参照してください。

---

## コード変更後の再デプロイ

ローカルでコードを編集した後：

```bash
clasp push
clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description "変更内容の説明"
```

常に同じデプロイメントIDを使用して、公開URLを変更しないようにしてください。

`package.json`にスクリプトを追加すると便利です：

```json
{
  "scripts": {
    "deploy": "clasp push && clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description \"update\""
  }
}
```

以降のデプロイは次のコマンドだけで完了します：

```bash
npm run deploy
```

---

## セキュリティについて

- すべてのGoogle Sheetsは**制限付き**共有に設定 — 編集できるのは管理者のみ
- Webアプリはデプロイ者として実行 — 匿名ユーザーはSheetsに直接アクセス不可
- Configタブに登録されたSheet IDのみ読み込み可能 — 未登録のSheet IDは拒否
- 入力の文字数と文字種類をクライアント・サーバー両側で検証
- ハニーポットフィールドによる基本的なボット対策
- `LockService`による同時申込み時の競合状態の防止
- 役割の検証はサーバーサイドで実施 — クライアントからの不正な役割は拒否

---

## プロジェクト構成

```
signup-app/
├── Code.gs          # バックエンド — Google Sheetsの読み書き、Webアプリの配信
├── index.html       # フロントエンド — グリッド表示、モーダル申込みフォーム
├── appsscript.json  # Apps Script設定
├── CHANGELOG.md     # バージョン履歴
└── README.md        # このファイル
```

---

## コントリビューション

コントリビューションを歓迎します！Issueの作成やPull Requestの送信をお気軽にどうぞ。

1. リポジトリをフォーク
2. フィーチャーブランチを作成（`git checkout -b feature/my-feature`）
3. 変更をコミット（`git commit -m 'add my feature'`）
4. ブランチをプッシュ（`git push origin feature/my-feature`）
5. Pull Requestを作成

---

## 変更履歴

バージョン履歴は[CHANGELOG.md](CHANGELOG.md)を参照してください。

---

## ライセンス

MIT — 詳細は[LICENSE](LICENSE)を参照してください。

---

## 謝辞

[Google Apps Script](https://developers.google.com/apps-script)と[Google Sheets](https://sheets.google.com)を使用して構築されました。
