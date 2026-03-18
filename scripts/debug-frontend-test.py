#!/usr/bin/env python3
"""
Gather debug files for frontend test failures in @paladin/conversation package.
Saves output to ~/scratch/output.txt and opens it in browser.
"""

import subprocess
import webbrowser
from pathlib import Path

SCRATCH_DIR = Path.home() / "scratch"
OUTPUT_FILE = SCRATCH_DIR / "output.txt"

CONVERSATION_DIR = Path("/home/kdog3682/projects/paladin/packages/conversation")

BASE_FILES = [
    "src/tests/colorful-frontend-conversation.test.ts",
    "src/tests/mocks/colorful-frontend-conversation.txt",
    "src/analyze.ts",
    "src/build.ts",
    "src/index.ts",
]


def find_types_ts():
    """Search for types.ts in the conversation directory."""
    types_path = CONVERSATION_DIR / "src" / "types.ts"
    if types_path.exists():
        return types_path
    for p in CONVERSATION_DIR.rglob("types.ts"):
        return p
    return None


def gather_files(types_ts_path: Path | None):
    """Read all relevant files and combine them."""
    output = []
    
    output.append("=== DEBUG: Frontend Test Failures in @paladin/conversation ===")
    output.append("")
    
    if types_ts_path and types_ts_path.exists():
        output.append("=== " + str(types_ts_path.relative_to(CONVERSATION_DIR)) + " ===")
        output.append("")
        output.append(types_ts_path.read_text())
    
    for rel_path in BASE_FILES:
        filepath = CONVERSATION_DIR / rel_path
        if filepath.exists():
            output.append("=== " + str(filepath.relative_to(CONVERSATION_DIR)) + " ===")
            output.append("")
            output.append(filepath.read_text())
        else:
            output.append("=== " + rel_path + " ===")
            output.append("")
            output.append("[FILE NOT FOUND]")
    
    return "\n".join(output)


def run_test():
    """Run the colorful frontend test and capture output."""
    result = subprocess.run(
        ["bun", "test", "tests/colorful-frontend-conversation.test.ts"],
        cwd=str(CONVERSATION_DIR),
        capture_output=True,
        text=True
    )
    return result.stdout, result.stderr, result.returncode


def main():
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    
    types_ts = find_types_ts()
    content = gather_files(types_ts)
    
    print("Running test...")
    stdout, stderr, returncode = run_test()
    
    test_output = []
    test_output.append("\n=== TEST OUTPUT ===")
    test_output.append("")
    test_output.append(f"Exit code: {returncode}")
    test_output.append("")
    test_output.append("--- STDOUT ---")
    test_output.append(stdout)
    if stderr:
        test_output.append("")
        test_output.append("--- STDERR ---")
        test_output.append(stderr)
    
    content += "\n".join(test_output)
    
    OUTPUT_FILE.write_text(content)
    print(f"Output saved to: {OUTPUT_FILE}")
    webbrowser.open(f"file://{OUTPUT_FILE}")
    print("Opened in browser")


if __name__ == "__main__":
    main()
