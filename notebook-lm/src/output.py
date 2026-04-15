"""Download generated artifacts from notebooklm."""

from pathlib import Path
from typing import Literal

from .wrapper import SUPPORTED_TYPES, download_artifact

ArtifactType = Literal["all", "audio", "video", "quiz", "flashcards", "slides", 
                       "infographic", "report", "mindmap", "datatable"]


def download_all(
    notebook_id: str,
    output_dir: Path,
    artifact_type: ArtifactType = "all",
) -> list[Path]:
    """Download artifacts for a notebook.

    Args:
        notebook_id: ID of the notebook.
        output_dir: Directory to save artifacts.
        artifact_type: Type of artifact to download.

    Returns:
        List of downloaded artifact paths.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    if artifact_type == "all":
        types = SUPPORTED_TYPES
    else:
        types = [artifact_type]

    downloaded = []
    for atype in types:
        paths = download_artifact(notebook_id, atype, output_dir / atype)
        downloaded.extend(paths)

    return downloaded
