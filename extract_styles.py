from pathlib import Path
path = Path(r'f:\FlowEx\\flowex\\index.html')
text = path.read_text(encoding='utf-8')
blocks = []
start = 0
while True:
    i = text.find('<style>', start)
    if i == -1: break
    j = text.find('</style>', i)
    if j == -1: break
    blocks.append(text[i+len('<style>'):j])
    start = j + len('</style>')
out = Path(r'f:\FlowEx\\flowex\\styles.css')
out.write_text('\n\n'.join(block.strip() for block in blocks) + '\n', encoding='utf-8')
print(f'Extracted {len(blocks)} style blocks to {out}')
