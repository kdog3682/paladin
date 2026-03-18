# @paladin/ai/tasks/transcribe_pdf.py
from paladin.ai.client import get_client, MODEL
from paladin.pdf.utils.render import to_images

DPI = 300
MAX_TOKENS = 8192
BATCH_SIZE = 3


def transcribe_pdf(path: str, instructions: str) -> list[str]:
    client = get_client()
    images = to_images(path, DPI)
    results = []

    for i in range(0, len(images), BATCH_SIZE):
        batch = images[i:i + BATCH_SIZE]
        start = i + 1
        end = i + len(batch)
        label = f"Pages {start}-{end} of {len(images)}"
        print(f"[{label}]")

        content = [
            *[{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}} for img in batch],
            {"type": "text", "text": label},
        ]

        res = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": content},
            ],
            max_tokens=MAX_TOKENS,
            temperature=1.0,
            top_p=0.95,
        )

        usage = res.usage
        if usage:
            print(f"  {usage.prompt_tokens} in / {usage.completion_tokens} out")

        results.append(res.choices[0].message.content or "")

    return results
