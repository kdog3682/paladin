# test-runner.py
import sys
import os
import re
import subprocess
import webbrowser
import urllib.parse
from pathlib import Path


def find_closest_package_json(file_path: str) -> Path | None:
    current = Path(file_path).resolve()
    if current.is_file():
        current = current.parent

    while current != current.parent:
        candidate = current / "package.json"
        if candidate.exists():
            return candidate
        current = current.parent

    return None


def find_types_files(package_dir: Path) -> list[Path]:
    return sorted(package_dir.glob("types.ts")) + sorted(package_dir.glob("*.types.ts"))


def extract_erroring_files(output: str, package_dir: Path) -> list[Path]:
    patterns = [
        r'(?:FAIL|ERROR|error)\s+(.+?\.[tj]sx?)',       # FAIL src/foo.ts
        r'([^\s]+?\.[tj]sx?)[\s:(]\d+',                   # src/foo.ts:10 or src/foo.ts(10,5)
        r'at\s+.*?\((.+?\.[tj]sx?):\d+:\d+\)',            # at Function (src/foo.ts:10:5)
    ]

    files = set()
    for pattern in patterns:
        for match in re.finditer(pattern, output):
            file_path = match.group(1).strip()
            resolved = (package_dir / file_path).resolve()
            if resolved.exists():
                files.add(resolved)
            elif Path(file_path).resolve().exists():
                files.add(Path(file_path).resolve())

    return sorted(files)


def read_file_contents(files: list[Path]) -> str:
    sections = []
    for f in files:
        try:
            content = f.read_text()
            sections.append(f"--- {f} ---\n{content}")
        except Exception as e:
            sections.append(f"--- {f} ---\n[Could not read: {e}]")
    return "\n\n".join(sections)


def main(file_path):
    pkg_json = find_closest_package_json(file_path)

    if not pkg_json:
        print(f"No package.json found for {file_path}")
        sys.exit(1)

    package_dir = pkg_json.parent
    print(f"Found package.json at: {pkg_json}")
    print(f"Running tests in: {package_dir}\n")

    result = subprocess.run(
        ["bun", "test"],
        cwd=package_dir,
        capture_output=True,
        text=True,
    )

    combined_output = result.stdout + "\n" + result.stderr

    if result.returncode == 0:
        print("✅ All tests passed!")
        print(combined_output)
        sys.exit(0)

    print("❌ Tests failed.\n")
    print(combined_output)

    # Gather offending files
    erroring_files = extract_erroring_files(combined_output, package_dir)
    types_files = find_types_files(package_dir)

    all_files = list(dict.fromkeys(erroring_files + types_files))  # dedupe, preserve order

    print(f"\nCollected {len(erroring_files)} erroring file(s) and {len(types_files)} types file(s)")
    for f in all_files:
        print(f"  → {f}")

    # Build the prompt
    file_contents = read_file_contents(all_files)
    prompt = f"""The following bun tests failed. Please help me fix them.

## Test Output
```
{combined_output.strip()}
```

## Relevant Files
{file_contents}
"""

    encoded = urllib.parse.quote(prompt, safe="")
    url = f"https://claude.ai/new?q={encoded}"

    # URL length sanity check — browsers cap around 2MB for most
    if len(url) > 1_500_000:
        print("\n⚠️  Payload too large for URL. Writing to temp file instead.")
        tmp = Path("/tmp/test-runner-prompt.md")
        tmp.write_text(prompt)
        print(f"Prompt saved to: {tmp}")
    else:
        print("\nOpening Claude with context...")
        webbrowser.open(url)


if __name__ == "__main__":
    main("/home/kdog3682/projects/paladin/packages/conversation/src/analyze.ts")
