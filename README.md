# Infra Notes — AWSインフラ学習ラボ

メモの登録・一覧表示だけを行う小さなWebアプリです。アプリを題材として固定し、環境の再現性、認証、監視、障害対応、性能、費用を段階的に学びます。

## 最初に動かす

Python 3.10以上で、追加ライブラリなしでローカル動作します。

ターミナルで、このプロジェクトのルートフォルダー（`local.py` がある場所）を開いて実行します。

```sh
python3 local.py
```

ブラウザで http://127.0.0.1:8080 を開きます。停止は Ctrl+C。メモは `local.sqlite3` に保存され、再起動しても残ります。ローカル版は固定ユーザーを使う開発専用で、127.0.0.1だけで待ち受けます。

```sh
python3 -m unittest discover -s tests -v
```

## 構成

| 項目 | ローカル | AWS（未デプロイ） |
|---|---|---|
| 画面 | PythonからHTMLを配信 | 最初は同じローカル画面からAPI接続 |
| API | Python HTTPServer | API Gateway HTTP API → Lambda |
| 認証 | 固定の開発ユーザー | Cognito → API Gateway JWT認証 |
| データ | SQLite | DynamoDB |
| 環境定義 | Pythonの起動 | AWS SAM / CloudFormation |

AWSではブラウザから送られたユーザーIDを信用せず、API Gatewayが検証したJWTの `sub` をデータの所有者にします。Lambdaの権限は対象テーブルのQuery・PutItemに限定しています。ユーザー名・パスワードを入力するログイン画面を用意しています。初回パスワード変更にも対応しています。操作方法は [ログイン画面](docs/03-login-screen.md) を参照してください。

## なぜSAMか

最初はAWS SAMを選びました。API・Lambda・認証・テーブルを一つのファイルで読み、サーバーレスの接続関係を追いやすくするためです。Terraformは必須ではありません。後で同じ構成をTerraformで表現する比較演習もできます。

## 実装状況と制約

- 作成済み：ローカルアプリ、共通API処理、SAM構成、単体テスト、学習手順。
- 未検証：AWS上でのデプロイ・JWT認証・IAM・DynamoDBの実動作。単体テストでAWSの動作を保証するものではありません。
- 未実装：S3添付、セルフサインアップ、CI/CD、アラーム、復元、負荷試験。
- 一覧は最新50件のみ。ページングや編集・削除は当面対象外。
- 学習用スタックは削除時にテーブル・ユーザープールも削除されます。実データを入れないでください。
- Lambdaのboto3はランタイム同梱版を使用。依存の固定・パッケージ化は再現性の改善課題です。

AWSへの構築方法は [AWSデプロイ手順](docs/02-aws.md) を参照してください。学習計画・演習・学習実績は、このリポジトリの親にある `aws/` ディレクトリで管理します。

## 公式資料

- [SAMのJWT認証](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-controlling-access-to-apis-oauth2-authorizer.html)
- [SAM CLIのインストール](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Lambda Pythonランタイム](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
