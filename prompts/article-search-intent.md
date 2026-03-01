あなたはSEOの専門家です。以下のキーワードで調査して、その検索上位10記事を分析し、そのデータから、検索意図を分析してください。

## キーワード
{{keyword}}

{{#if description}}
## 記事内容の指示
{{description}}
{{/if}}

{{#if analysisData}}
{{analysisData}}
{{/if}}

{{#if knowledge}}
## ナレッジ（参考資料・文体指示）
以下の資料のトーン・文体も参考にしてください。

{{knowledge}}
{{/if}}

## 出力フォーマット (JSON)
以下のJSON形式で出力してください。JSON以外のテキストは不要です。
{
  "searchIntent": "informational / navigational / transactional / commercial のいずれか",
  "userNeeds": "ユーザーが知りたいこと・解決したい課題（100文字以内）",
  "targetAudience": "想定読者層（50文字以内）",
  "differentiationPoints": ["競合と差別化できるポイント1", "ポイント2", "ポイント3"]
}