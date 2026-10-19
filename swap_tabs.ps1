$content = Get-Content 'src\components\screens\FeedScreen.tsx' -Raw
$content = $content -replace '            \["memories", "📖 Memories"],\s+            \["highlights", "✨ Highlights"],', '            ["highlights", "✨ Highlights"],\n            ["memories", "📖 Memories"],'
Set-Content 'src\components\screens\FeedScreen.tsx' -Value $content -NoNewline
