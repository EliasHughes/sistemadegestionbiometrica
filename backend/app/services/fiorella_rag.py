from __future__ import annotations

import os
import time
from pathlib import Path

from google import genai


def create_store(display_name: str = "Fiorella Knowledge Base"):
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return client.file_search_stores.create(
        config={
            "display_name": display_name,
            "embedding_model": "models/gemini-embedding-2",
        }
    )


def upload_directory(store_name: str, directory: str = "backend/knowledge"):
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    results = []
    for path in sorted(Path(directory).glob("*")):
        if not path.is_file():
            continue
        uploaded = client.files.upload(file=str(path))
        op = client.file_search_stores.import_file(
            file_search_store_name=store_name,
            file_name=uploaded.name,
        )
        while not op.done:
            time.sleep(2)
            op = client.operations.get(op)
        results.append({"file": path.name, "uploaded": uploaded.name})
    return results
