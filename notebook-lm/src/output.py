"""Download generated artifacts from notebooklm."""

from pathlib import Path
from typing import Literal

ArtifactType = Literal["all", "pdf", "markdown", "slides"]


def download_all(
    notebook_id: str,
    output_dir: Path,
    artifact_type: ArtifactType = "all",
) -> list[Path]:
    """Download artifacts for a notebook.

    Args:
        notebook_id: ID of the notebook.
        output_dir: Directory to save artifacts.
        artifact_type: Type of artifact to download ("all", "pdf", "markdown", "slides").

    Returns:
        List of downloaded artifact paths.
    """
    # Placeholder implementation
    output_dir.mkdir(parents=True, exist_ok=True)
    return []
