#!/usr/bin/env python3
import json
from pathlib import Path

catalog = json.loads(Path("public/data/catalog.json").read_text(encoding="utf-8"))
assert len(catalog["exercises"]) == 317
assert len({item["id"] for item in catalog["exercises"]}) == 317
for exercise in catalog["exercises"]:
    assert exercise["name"] and exercise["steps"] and exercise["formCues"]
    assert exercise["media"].get("video") and exercise["media"].get("thumbnail")
print("Exercise catalog is valid")

