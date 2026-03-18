# @paladin/ai/client.py
import os
from openai import OpenAI

MODEL = "kimi-k2.5"
BASE_URL = "https://api.moonshot.ai/v1"


def get_client() -> OpenAI:
    return OpenAI(
        api_key=os.environ["MOONSHOT_API_KEY"],
        base_url=BASE_URL,
    )
