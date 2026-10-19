import re

# Read the file
with open('src/components/screens/FeedScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Swap the tabs order
content = content.replace(
    '            ["memories", "📖 Memories"],\n            ["highlights", "✨ Highlights"],',
    '            ["highlights", "✨ Highlights"],\n            ["memories", "📖 Memories"],'
)

# Swap the content sections - first find the memories section and highlights section
# Replace memories content with highlights content and vice versa
memories_section_start = content.find('{activeTab === "memories" && (')
highlights_section_start = content.find('{activeTab === "highlights" && (')

if memories_section_start != -1 and highlights_section_start != -1:
    # Find the end of each section
    memories_section_end = content.find(')}', memories_section_start) + 2
    highlights_section_end = content.find(')}', highlights_section_start) + 2
    
    # Extract the sections
    memories_section = content[memories_section_start:memories_section_end]
    highlights_section = content[highlights_section_start:highlights_section_end]
    
    # Swap them
    content = content[:memories_section_start] + highlights_section + content[memories_section_end:]
    # Recalculate highlights position after the first swap
    new_highlights_start = content.find('{activeTab === "highlights" && (')
    content = content[:new_highlights_start] + memories_section + content[new_highlights_start + len(highlights_section):]

# Write the file back
with open('src/components/screens/FeedScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully swapped memories and highlights")
