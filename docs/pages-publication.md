# 水滴キャッチ：Pages workflowのレビュー候補

## 現状と前提
このPRは既存の公開設定を置き換える操作ではなく、リポジトリ内のworkflow追加候補です。現リポジトリはPages有効のメタ情報を持ちますが、公開元がActionsかbranchか、実URLが返すゲームの内容は未確認です。Actions実行履歴がないことだけから「未公開」とは判断しません。

**マージ前にownerが既存Pages公開元・権限・github-pages環境を確認してください。** この候補自身はPages設定や環境保護を変更しません。適切な設定を確認するまでは配備が動作するとは主張しません。

## 提案する動作
- PRではNode標準モジュールだけの既存限定テストとpackaging回帰を実施し、デプロイしません。
- mainへのpushでは同じ検証後、新規一時ディレクトリに次のファイルだけをbyteコピーし、Pages artifactとして渡します。
- `index.html`
- `languages.js`
- `i18n.js`
- `audio.js`
- `normal-score-ack8.js`
- README、docs、テスト、編集用source、内部資料をartifactへまとめて入れません。現在のruntimeは変更しません。
- `scripts/package-pages.cjs` はコピー対象の通常ファイル・ローカル参照を確認し、欠落やsymlinkを拒否します。artifact出力は毎回新しいdirectoryで、その中への書込みは新規file限定です。GITHUB_OUTPUTだけはrunnerの指定fileへ追記し、既存内容を切り詰めません。削除・再帰cleanup・既存artifact上書き・ゲーム実行はしません。
- 配備jobはmain push限定、検証job成功に依存し、productionの同時実行を抑制します。配備直前にmain SHAを照合します。これは照合時点のガードであって、その後のmain更新まで原子的に固定する保証ではありません。
- workflow_dispatch、npm/install/build、custom cleanup、設定変更用API、新しい資格情報は追加しません。標準のgithub.tokenとPages/OIDC権限の宣言だけを使います。

## 実行と安全性の境界
Matigaiで使われている上位actionの固定SHAを採用しています。
- checkout: `11d5960a326750d5838078e36cf38b85af677262`
- upload-pages-artifact: `56afc609e74202658d3ffba0e8f6dda462b719fa`
- deploy-pages: `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e`

**上位SHA固定は依存閉包全体の固定・安全性証明ではありません。** upload-pages-artifactの内部は `actions/upload-artifact@v4` を参照します。checkoutの本体/postと他vendor処理は `clean:false` だけでは副作用を除去できません。内部の削除・cleanupが実行許可済みとみなされないため、今回エージェントはActionsを実行しません。vendorを改変して迂回もしません。

Draft作成時は `[skip ci]` を使い、CI成功とは報告しません。ownerが実行と公開設定を確認し、後にskipなしのmain更新を行うと、条件が満たされればverifyとdeployが動作する設計です。マージメッセージにskipが残る場合は開始されません。このPRの作成と実際のCI・マージ・公開は別の段階です。

packagerはローカルの隔離fixtureでbyte一致・限定ファイル・欠落/symlink拒否・既存出力保持を検証します。実ゲーム・ネットワーク・音・ブラウザーやvendor actionの実行ではありません。HTML参照検査は現在の明示的なローカル配布物を対象にする限定検査で、将来の動的依存を自動的に発見する保証はありません。画像等を追加する際は配布allowlistとテストも更新します。

## 変わらない残件
接続キーは元のプレースホルダーのままです。このworkflowだけで実ランキングや登録が動くとは扱いません。接続設定の確認は別の明示的な作業であり、このPRではキー・資格情報・DBを変更しません。

旧Codeberg共有URLはGitHub実公開を確認するまで維持します。実画面サムネイル・OG/Twitter情報、実験場リンクの関連PR、匿名計測・実スコア連携、実機と音の確認も別途必要です。Pages公開だけでこれらの完了とは扱いません。

既存の共通仕様文書・manifestにある「workflow未追加」は先行PR時点の記録です。本候補はworkflow追加を提案しますが、実行済み・設定確認済みへの変更を意味しません。
