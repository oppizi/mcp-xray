#!/usr/bin/env python3
"""
Add `isError: true` to every error-return in src/tools/.

A tool "error-return" is a return statement whose content contains "Error",
"not configured", or "Invalid" — indicating a failure path. These must
include isError:true so MCP clients detect the failure.

Run: python3 scripts/fix-error-returns.py

Safe to re-run: skips returns that already have isError.
"""

import re
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent.parent / 'src' / 'tools'

# Match an entire `return { ... };` block that contains error text but no isError.
# Multi-line match, non-greedy.
RETURN_BLOCK = re.compile(
    r'(return\s*\{\s*\n'  # `return {\n`
    r'((?:[^{}]|\{[^{}]*\})*?)'  # inner content, no nested braces
    r'\s*\};)',
    re.MULTILINE,
)

ERROR_INDICATORS = re.compile(
    r"(Error|not configured|Invalid|Failed|Provide either|Cannot|Must)",
    re.IGNORECASE,
)

def has_is_error(block: str) -> bool:
    return re.search(r'\bisError\b', block) is not None


def indicates_error(block: str) -> bool:
    return ERROR_INDICATORS.search(block) is not None


def add_is_error(block: str) -> str:
    """Insert `isError: true,\n    ` before the closing `};`."""
    # Find indentation of the closing `};`
    m = re.search(r'(\n)([ \t]*)\};$', block)
    if not m:
        return block
    indent = m.group(2)
    # Insert isError: true as a new property just before the closing }.
    insertion = f',\n{indent}  isError: true'
    # Strip any trailing comma from the last property (we'll add our own).
    # Find the last non-whitespace char before `};`
    before = block[: m.start(1)]
    # If it ends with `,`, leave it alone (our insertion uses leading comma? no, we can be smarter)
    # Use a simpler approach: insert `  isError: true,\n${indent}`
    replacement = f'\n{indent}  isError: true,\n{indent}' + '};'
    # Replace closing `};` with our injection
    return re.sub(r'(\n)([ \t]*)\};$', replacement, block)


def fix_file(path: Path) -> int:
    src = path.read_text()
    out_parts = []
    last_end = 0
    count = 0

    for m in RETURN_BLOCK.finditer(src):
        out_parts.append(src[last_end : m.start()])
        block = m.group(1)

        if has_is_error(block) or not indicates_error(block):
            # Already fine, or not an error return — leave untouched
            out_parts.append(block)
        else:
            new_block = add_is_error(block)
            if new_block == block:
                # add_is_error didn't change anything — skip silently
                out_parts.append(block)
            else:
                out_parts.append(new_block)
                count += 1

        last_end = m.end()

    out_parts.append(src[last_end:])
    result = ''.join(out_parts)

    if count > 0:
        path.write_text(result)
    return count


def main():
    total = 0
    files_changed = 0
    for path in sorted(TOOLS_DIR.rglob('*.ts')):
        n = fix_file(path)
        if n > 0:
            files_changed += 1
            total += n
            rel = path.relative_to(TOOLS_DIR.parent.parent)
            print(f'  {rel}: {n} return(s) fixed')

    print(f'\n{total} error returns fixed across {files_changed} files.')


if __name__ == '__main__':
    main()
