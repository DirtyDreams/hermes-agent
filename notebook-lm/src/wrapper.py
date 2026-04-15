"""Wrapper functions for notebooklm CLI."""

import json
import subprocess
from typing import Any

NOTEBOOKLM_CLI = "notebooklm"


def run(args: list[str]) -> dict[str, Any]:
    """Run notebooklm CLI with given args and return parsed JSON."""
    try:
        result = subprocess.run(
            [NOTEBOOKLM_CLI] + args,
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(result.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError) as e:
        raise RuntimeError(f"notebooklm CLI failed: {e}") from e


def list_notebooks() -> list[dict[str, Any]]:
    """List all notebooks."""
    result = run(["list", "--format", "json"])
    if not isinstance(result, list):
        raise RuntimeError("list_notebooks: expected list response")
    return result


def create_notebook(name: str) -> dict[str, Any]:
    """Create a new notebook with the given name."""
    result = run(["create", name, "--format", "json"])
    if not isinstance(result, dict):
        raise RuntimeError("create_notebook: expected dict response")
    return result


def get_notebook_state(notebook_id: str) -> dict[str, Any]:
    """Get the current state of a notebook."""
    result = run(["state", notebook_id, "--format", "json"])
    if not isinstance(result, dict):
        raise RuntimeError("get_notebook_state: expected dict response")
    return result
