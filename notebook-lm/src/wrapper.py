"""Wrapper functions for notebooklm CLI."""

import json
import subprocess
from pathlib import Path
from typing import Any

NOTEBOOKLM_CLI = "notebooklm"

SUPPORTED_TYPES = ["audio", "video", "quiz", "flashcards", "slides", 
                   "infographic", "report", "mindmap", "datatable"]


def run(args: list[str]) -> dict[str, Any]:
    """Run notebooklm CLI with given args and return parsed JSON."""
    try:
        result = subprocess.run(
            [NOTEBOOKLM_CLI] + args,
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
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
    if not name or not name.strip():
        raise ValueError("create_notebook: name cannot be empty")
    result = run(["create", name, "--format", "json"])
    if not isinstance(result, dict):
        raise RuntimeError("create_notebook: expected dict response")
    return result


def get_notebook_state(notebook_id: str) -> dict[str, Any]:
    """Get the current state of a notebook."""
    if not notebook_id or not notebook_id.strip():
        raise ValueError("get_notebook_state: notebook_id cannot be empty")
    result = run(["state", notebook_id, "--format", "json"])
    if not isinstance(result, dict):
        raise RuntimeError("get_notebook_state: expected dict response")
    return result


def add_source(notebook_id: str, source: str) -> dict[str, Any]:
    """Add a source (URL, PDF path, etc.) to a notebook.

    Args:
        notebook_id: The notebook ID (e.g., from create output)
        source: URL or file path to add as source

    Returns:
        dict with status info
    """
    if not notebook_id or not notebook_id.strip():
        raise ValueError("add_source: notebook_id cannot be empty")
    if not source or not source.strip():
        raise ValueError("add_source: source cannot be empty")
    output = run(["notebook", "add-source", notebook_id, source, "--json"])
    return output


def ask_question(notebook_id: str, question: str) -> dict[str, Any]:
    """Ask a question to a notebook.

    Args:
        notebook_id: The notebook ID
        question: The question to ask

    Returns:
        dict with answer from NotebookLM
    """
    if not notebook_id or not notebook_id.strip():
        raise ValueError("ask_question: notebook_id cannot be empty")
    if not question or not question.strip():
        raise ValueError("ask_question: question cannot be empty")
    output = run(["notebook", "ask", notebook_id, question, "--json"])
    return output


def generate(notebook_id: str, gen_type: str, wait: bool = False) -> dict[str, Any]:
    """Generate content (audio, video, quiz, etc.).

    Args:
        notebook_id: The notebook ID
        gen_type: Type of content (audio, video, quiz, flashcards, slides, etc.)
        wait: If True, wait for generation to complete

    Returns:
        dict with generation status
    """
    if gen_type not in SUPPORTED_TYPES:
        raise ValueError(f"Unknown type: {gen_type}. Use one of: {SUPPORTED_TYPES}")

    cmd = ["notebook", "generate", gen_type, "--notebook", notebook_id]
    if wait:
        cmd.append("--wait")

    output = run(cmd)
    return output


def download_artifact(notebook_id: str, artifact_type: str, output_dir: Path) -> list[Path]:
    """Download generated artifacts.

    Args:
        notebook_id: The notebook ID
        artifact_type: Type of artifact (audio, video, quiz, etc.)
        output_dir: Directory to save downloaded files

    Returns:
        list of Path objects for downloaded files
    """
    cmd = ["notebook", "download", notebook_id, artifact_type, 
           "--output", str(output_dir), "--json"]
    output = run(cmd)
    paths = output.get("downloaded", [])
    return [Path(p) for p in paths]
