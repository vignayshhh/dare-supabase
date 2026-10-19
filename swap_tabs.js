const fs = require('fs');

// Read the file
const content = fs.readFileSync('src/components/screens/FeedScreen.tsx', 'utf8');

// Swap the tabs order
let newContent = content.replace(
    '            ["memories", "📖 Memories"],\n            ["highlights", "✨ Highlights"],',
    '            ["highlights", "✨ Highlights"],\n            ["memories", "📖 Memories"],'
);

// Swap the content sections
const memoriesMatch = newContent.match(/(\{activeTab === "memories" && \([^)]+\)\))/s);
const highlightsMatch = newContent.match(/(\{activeTab === "highlights" && \([^)]+\)\))/s);

if (memoriesMatch && highlightsMatch) {
    const memoriesSection = memoriesMatch[0];
    const highlightsSection = highlightsMatch[0];
    
    // Replace memories with highlights first
    newContent = newContent.replace(memoriesSection, highlightsSection);
    
    // Then replace highlights with memories (need to find it again since content changed)
    const newHighlightsMatch = newContent.match(/(\{activeTab === "highlights" && \([^)]+\)\))/s);
    if (newHighlightsMatch) {
        newContent = newContent.replace(newHighlightsMatch[0], memoriesSection);
    }
}

// Write the file back
fs.writeFileSync('src/components/screens/FeedScreen.tsx', newContent, 'utf8');

console.log('Successfully swapped memories and highlights');
