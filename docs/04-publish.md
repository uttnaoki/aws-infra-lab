# AWSで画面を公開する

## 構成と公開範囲

ブラウザー → CloudFront（HTTPS）→ 非公開S3に置いた画面、という構成です。
画面から既存のCognitoにログインし、API Gateway → Lambda → DynamoDBを呼び出します。
ログイン画面は誰でも開けます。メモを取得・保存できるのはログイン済みユーザーだけです。セルフサインアップの反映手順は [アカウント作成](05-signup.md) を参照してください。

S3はシドニー、CloudFrontはグローバルサービスです。CloudFront標準ドメインと証明書を使います。
APIのCORSには新しい公開URLがテンプレートで自動追加されます。ワイルドカードにはしません。
S3を公開バケットにはせず、OACによってこのCloudFrontからだけ読み取りを許可します。
現在は更新を分かりやすくするため配信キャッシュを無効にしています。アクセスが増える段階でキャッシュ設計を追加します。

無料プランからの変更は行いません。S3とCloudFrontは新しいAWSエクスペリエンスの無料プラン対象サービスですが、無料プラン・クレジットの残量や期限はAWS Settingsで確認してください。無制限・永久無料を意味しません。
WAF、配信アクセスログ、アラームは今回未追加です。公開範囲を広げて運用する前の改善課題です。

## 1. 認証と検証

以下の操作は本人がプロジェクトのルートフォルダーで実行します。
既存の `.env` に以下を追加してください（APIの設定値は残します）。

```dotenv
AWS_PROFILE=
AWS_REGION=
WEBSITE_BUCKET=
```

`WEBSITE_BUCKET` は初回デプロイ後に設定します。既に設定済みならその値を残してください。

AWS CLIは `AWS_PROFILE` と `AWS_REGION` を参照します。SAMは保存済みの設定との優先順位を明確にするため、変数を引数にも渡します。CLI用の設定は公開JSONには含めません。

```sh
set -a
source .env
set +a
aws login
aws freetier get-account-plan-state --query accountPlanType --output text
sam validate --lint --profile "$AWS_PROFILE" --region "$AWS_REGION"
sam build
```

プランはFREEを維持します。権限エラーが出ても有料化や高度な機能への移行はせず、エラーを確認します。

## 2. 変更セットを確認して適用

```sh
sam deploy --profile "$AWS_PROFILE" --region "$AWS_REGION" --confirm-changeset
```

既存の `samconfig.toml` の `infra-notes-dev` を更新します。未設定の別端末では `--guided` を利用してください。
変更セットではS3・CloudFront関連の5リソースの追加とAPIの更新を確認します。
CognitoユーザープールやDynamoDBテーブルの削除・置換が含まれていたら実行せず確認してください。
CloudFrontの反映には数分以上かかる場合があります。完了後、出力に `WebsiteUrl` と `WebsiteBucketName` が追加されます。
この時点ではまだ画面のファイルがないため、公開URLはエラーになることがあります。

## 3. 公開する4ファイルを準備

CloudFormationの現在の出力から公開設定を取得します。ローカルの古い設定に依存しません。

```sh
export API_URL="$(aws cloudformation describe-stacks --stack-name infra-notes-dev --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue | [0]' --output text)"
export COGNITO_CLIENT_ID="$(aws cloudformation describe-stacks --stack-name infra-notes-dev --query 'Stacks[0].Outputs[?OutputKey==`ClientId`].OutputValue | [0]' --output text)"
python3 scripts/build_site.py
```

このコマンドはリポジトリ直下の `.env` から `API_URL` と `COGNITO_CLIENT_ID` を自動で読み込みます。生成だけなら `source .env` は不要です。設定済みの環境変数を優先します。値は `KEY=value` または引用符付きで指定でき、変数展開・コマンド実行は行いません。AWS CLIを直接実行するときの環境変数読み込みは引き続き必要です。

`dist/` にHTML・JavaScript2個・公開設定JSONだけを作ります。実行環境の全変数や `.env` はコピーしません。
予期しないファイルが既に `dist/` にある場合は処理を止めます。内容を確認してから整理してください。
`dist/` 自体もGit除外対象です。

## 4. S3へアップロード

```sh
aws cloudformation describe-stacks --stack-name infra-notes-dev --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue | [0]' --output text
```

表示されたバケット名を、Git管理対象外の `.env` の `WEBSITE_BUCKET` に設定します。既に設定済みの場合は、この出力と一致することを確認してください。`.env.example` は空欄のまま共有します。

設定後は、同じターミナルで `.env` を再読み込みします。`WEBSITE_BUCKET` はアップロードコマンド用で、公開する `config.json` には含まれません。

```sh
set -a
source .env
set +a
: "${WEBSITE_BUCKET:?Set WEBSITE_BUCKET in .env}"
```

以下の4ファイルだけをアップロードします。リポジトリ全体をアップロードしないでください。

```sh
aws s3 cp dist/auth.mjs "s3://${WEBSITE_BUCKET}/auth.mjs" --content-type 'text/javascript; charset=utf-8' --cache-control no-store
aws s3 cp dist/app.mjs "s3://${WEBSITE_BUCKET}/app.mjs" --content-type 'text/javascript; charset=utf-8' --cache-control no-store
aws s3 cp dist/config.json "s3://${WEBSITE_BUCKET}/config.json" --content-type 'application/json; charset=utf-8' --cache-control no-store
aws s3 cp dist/index.html "s3://${WEBSITE_BUCKET}/index.html" --content-type 'text/html; charset=utf-8' --cache-control no-store
```

## 5. 公開URLで検証

CloudFormationの出力 `WebsiteUrl` を開きます。

- HTTPSで画面が開き、ローカル練習用のボタンが出ない。
- 既存のCognitoユーザーでログインできる。
- メモを保存して再ログインしても取得できる。
- 別ユーザーから他人のメモが見えない。
- 未ログインのAPI呼び出しは拒否される。

公開画面での実動作はデプロイ後に確認します。ローカルの単体テストだけで公開成功とはしません。

## 片付け

削除は自動では行いません。学習を続ける間は環境を残します。
新しいS3バケットには保持設定があり、スタック削除後もバケットとバージョンが残ります。
完全に片付ける場合は保存内容を確認したうえで、全バージョンと削除マーカーを含む別途の削除が必要です。
既存のメモテーブルとユーザープールは従来どおりスタック削除で失われます。

## 検証状況

ローカルのSAM lint、認証/API/公開ファイル生成のテストを実施。cfn-guardによる追加のセキュリティルール検査と、AWS側の変更セット検証は未実施です。AWS CLI再ログイン後、本人の操作で変更セットを作成します。

## 公式資料

- [新しいAWSエクスペリエンスの対応サービス](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
- [CloudFrontから非公開S3へ接続するOAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [CloudFrontの管理キャッシュポリシー](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)

AWS CLIの環境変数の優先順位は[公式資料](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html)を参照してください。

## ログイン画面の更新日時

ログイン画面の「最終更新」は `python3 scripts/build_site.py` で公開ファイルを生成した日時（日本時間）です。アップロード完了日時ではありません。生成した `dist/index.html` をアップロードすると表示も更新されます。ローカルサーバーでは「ローカル開発版」と表示します。
