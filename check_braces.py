
def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    lines = content.split('\n')
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '{':
                stack.append(('{', line_num))
            elif char == '}':
                if not stack:
                    print(f"Extra closing brace at line {line_num}")
                else:
                    stack.pop()
    
    if stack:
        for char, line_num in stack:
            print(f"Unmatched opening brace at line {line_num}")

check_braces(r"c:\Users\rober\Desktop\My App Local\cuepack-manager\src\components\PackingListBuilder.tsx")
