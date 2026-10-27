# dotclaude

[Claude Code](https://docs.claude.com/en/docs/claude-code) の個人設定（スキル・共有ルール）を管理するリポジトリ。複数プロジェクトで共通利用する設定を一元化する。

## 構成

```
.
└── skills/          # カスタムスキル定義（/<skill-name> で呼び出し）
    ├── address-review/   PR のレビュー指摘を 1 周ぶん直す
    ├── clean-branches/   ローカルの不要ブランチを一括削除
    ├── my-code-review/   コードレビューを実施
    ├── commit/           変更を分析しコミットメッセージを生成
    ├── mental-model-builder/  要素間の関係を読み解き最適な表現形式で可視化
    ├── pr-comment/        PR の変更内容を説明するコメントを投稿
    ├── tdd/              Kent Beck の TDD で開発を駆動
    └── update-readme/    変更内容を分析し README を最小編集で更新
```

## スキル一覧

| スキル | 説明 | トリガー例 |
|--------|------|-----------|
| `address-review` | PR のレビュー指摘を集めて再現を確かめ、直す指摘をユーザーに選んでもらい、1 件ずつ直してコミットし、変更を確認してもらってから push して、各指摘のスレッドに結果を返信する | 「/address-review <PR番号>」 |
| `clean-branches` | 現在のブランチ・`main`/`release`/`staging`/`develop` を保護し、不要なローカルブランチを削除 | 「ブランチを整理して」「/clean-branches」 |
| `my-code-review` | コードの品質・可読性・保守性・セキュリティを評価し改善提案。PR には Pending レビューで投稿し、再レビューでは前回からの差分だけを見て、判断済みの指摘はくり返さない | 「コードをレビューして」「このPRを確認して」 |
| `commit` | 変更内容を分析しコミットメッセージを生成、確認後にコミット実行 | 「コミットして」「/commit」 |
| `mental-model-builder` | 文章・概念の要素間の関係を読み解き、構造図・フロー・対比表などで可視化・整理 | 「メンタルモデルを作って」「構造を整理して」 |
| `pr-comment` | PR の変更内容を分析し、他のエンジニア向けの説明を GitHub PR に投稿 | 「PRにコメントして」「PRの説明を書いて」 |
| `tdd` | Kent Beck の Red → Green → Refactor で開発を駆動。テスト先行を強制し、テストリスト管理・三角測量・リファクタ規律を適用 | 「TDDで進めて」「/tdd」 |
| `update-readme` | 変更差分を分析し、README への反映が必要な公開面の変更だけを最小編集で更新 | 「READMEを更新して」「/update-readme」 |

各スキルの詳細は `skills/<name>/SKILL.md` を参照。

## セットアップ

このリポジトリを `~/.claude` 配下に展開、またはシンボリックリンクで配置して利用する。

```sh
git clone git@github.com:asanntech/dotclaude.git ~/dev/dotclaude

# 例: スキルを ~/.claude/skills にリンク
ln -s ~/dev/dotclaude/skills ~/.claude/skills
```

> 配置先のパスは利用環境に合わせて調整すること。
