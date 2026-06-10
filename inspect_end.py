from pathlib import Path
path = Path('renderer/components/legacy/LegacyAppLayout.jsx')
data = path.read_text(encoding='utf-8')
print('len', len(data))
start = data.index('const sidebarInnerHtml')
print('start', start)
end = data.index('";', start)
print('end', end)
print('snippet_end', repr(data[end-50:end+20]))
for i in range(max(0, end-120), end+1):
    if data[i] == '"':
        backslashes = 0
        j = i-1
        while j >= 0 and data[j] == '\\':
            backslashes += 1
            j -= 1
        if backslashes % 2 == 0:
            print('quote at', i, 'unescaped', repr(data[i-10:i+10]))
            break
print('last part', repr(data[6070:6150]))
