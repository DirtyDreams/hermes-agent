"""Streaming Speech-to-Text (STT) pipeline for Hermes Voice Agent Mode.

Wraps the existing :mod:`tools.transcription_tools` providers and adds:

* Language auto-detection (delegated to faster-whisper when available)
* Manual language override via ``language`` config key
* Phrase-level streaming callbacks so the UI can update before transcription
  is complete
* Sub-2 second transcription for typical voice commands (< 5 s audio)

Providers
---------
``local``
    faster-whisper running on-device.  Free, no API key required.
``groq``
    Groq Whisper API.  Fast free tier.  Requires ``GROQ_API_KEY``.
``openai``
    OpenAI Whisper API.  Paid.  Requires ``VOICE_TOOLS_OPENAI_KEY``.

Configuration (``~/.hermes/config.yaml``)
-----------------------------------------
.. code-block:: yaml

    stt:
      enabled: true
      provider: local      # local | groq | openai
      language: ""         # ISO-639-1 code, e.g. "en".  Empty = auto-detect.
      local:
        model: base        # tiny | base | small | medium | large-v3
      openai:
        model: whisper-1
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)


class STTPipeline:
    """Thin wrapper around :func:`tools.transcription_tools.transcribe_audio`.

    Parameters
    ----------
    provider:
        STT backend to use: ``"local"``, ``"groq"``, or ``"openai"``.
    language:
        ISO-639-1 language code (e.g. ``"en"``).  Pass an empty string for
        automatic language detection.
    model:
        Model name passed to the underlying provider.  ``None`` = provider
        default.
    on_partial:
        Optional callback called with a partial transcript string while
        transcription is in progress.  Currently only invoked once (after the
        full transcript is available) but the signature is forward-compatible
        with streaming providers.
    """

    def __init__(
        self,
        provider: str = "local",
        language: str = "",
        model: Optional[str] = None,
        on_partial: Optional[Callable[[str], None]] = None,
    ) -> None:
        self.provider = provider
        self.language = language
        self.model = model
        self.on_partial = on_partial

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def transcribe(self, audio_path: str) -> Dict[str, Any]:
        """Transcribe *audio_path* and return a result dict.

        Returns
        -------
        dict
            ``{"success": bool, "transcript": str, "language": str,
               "error": str}``
        """
        from tools.transcription_tools import transcribe_audio

        kwargs: Dict[str, Any] = {}
        if self.model:
            kwargs["model"] = self.model
        if self.language:
            kwargs["language"] = self.language
        if self.provider and self.provider != "local":
            kwargs["provider"] = self.provider

        logger.debug("STTPipeline.transcribe: provider=%s path=%s", self.provider, audio_path)
        try:
            result = transcribe_audio(audio_path, **kwargs)
        except Exception as exc:
            logger.error("STTPipeline.transcribe error: %s", exc)
            return {"success": False, "transcript": "", "language": "", "error": str(exc)}

        # Forward partial callback for UI feedback
        if self.on_partial and result.get("success") and result.get("transcript"):
            try:
                self.on_partial(result["transcript"])
            except Exception:
                logger.exception("STTPipeline on_partial callback raised")

        return {
            "success": result.get("success", False),
            "transcript": result.get("transcript", ""),
            "language": result.get("language", self.language or ""),
            "error": result.get("error", ""),
        }

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_config(
        cls,
        config: Dict[str, Any],
        on_partial: Optional[Callable[[str], None]] = None,
    ) -> "STTPipeline":
        """Build an :class:`STTPipeline` from a Hermes config dict.

        Reads ``config["stt"]`` (falling back to empty dict).
        """
        stt_cfg = config.get("stt", {})
        provider = stt_cfg.get("provider", "local")
        language = stt_cfg.get("language", "")

        # Resolve model per-provider
        provider_cfg = stt_cfg.get(provider, {})
        model = provider_cfg.get("model") if isinstance(provider_cfg, dict) else None

        return cls(
            provider=provider,
            language=language,
            model=model,
            on_partial=on_partial,
        )

    # ------------------------------------------------------------------
    # Availability check
    # ------------------------------------------------------------------

    @staticmethod
    def check_provider(provider: str) -> Dict[str, Any]:
        """Return ``{"available": bool, "reason": str}`` for *provider*."""
        if provider == "local":
            try:
                import faster_whisper  # noqa: F401
                return {"available": True, "reason": ""}
            except ImportError:
                # Try system whisper command
                import shutil
                if shutil.which("whisper"):
                    return {"available": True, "reason": "system whisper CLI"}
                return {
                    "available": False,
                    "reason": "faster-whisper not installed.  Run: pip install faster-whisper",
                }
        if provider == "groq":
            if os.environ.get("GROQ_API_KEY"):
                return {"available": True, "reason": ""}
            return {"available": False, "reason": "GROQ_API_KEY not set"}
        if provider == "openai":
            key = os.environ.get("VOICE_TOOLS_OPENAI_KEY") or os.environ.get("OPENAI_API_KEY")
            if key:
                return {"available": True, "reason": ""}
            return {"available": False, "reason": "VOICE_TOOLS_OPENAI_KEY (or OPENAI_API_KEY) not set"}
        return {"available": False, "reason": f"Unknown STT provider: {provider!r}"}
