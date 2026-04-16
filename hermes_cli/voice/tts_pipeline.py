"""Text-to-Speech (TTS) pipeline for Hermes Voice Agent Mode.

Wraps the existing :mod:`tools.tts_tool` / CLI speak path and adds:

* Markdown stripping for clean spoken text
* Voice selection helpers
* Provider availability checks
* Optional speed / language controls

Providers
---------
``edge``
    Microsoft Edge TTS.  Free, no API key needed.  ~40 ms latency.
``elevenlabs``
    ElevenLabs.  Premium quality.  Requires ``ELEVENLABS_API_KEY``.
``openai``
    OpenAI TTS.  Paid.  Requires ``VOICE_TOOLS_OPENAI_KEY``.
``neutts``
    NeuTTS (local neural TTS).  Free, runs on-device.

Configuration (``~/.hermes/config.yaml``)
-----------------------------------------
.. code-block:: yaml

    tts:
      provider: edge
      edge:
        voice: en-US-AriaNeural
      elevenlabs:
        voice_id: pNInz6obpgDQGcFmaJgB
        model_id: eleven_monolingual_v1
      openai:
        model: gpt-4o-mini-tts
        voice: alloy
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
import time
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

# Markdown patterns to strip before speaking
_MD_PATTERNS = [
    (re.compile(r"```[\s\S]*?```"), " "),           # fenced code blocks
    (re.compile(r"`([^`]+)`"), r"\1"),               # inline code
    (re.compile(r"\[([^\]]+)\]\([^)]+\)"), r"\1"),  # [text](url)
    (re.compile(r"https?://\S+"), ""),               # bare URLs
    (re.compile(r"\*\*(.+?)\*\*"), r"\1"),           # **bold**
    (re.compile(r"\*(.+?)\*"), r"\1"),               # *italic*
    (re.compile(r"^#{1,6}\s*", re.MULTILINE), ""),  # # headers
    (re.compile(r"^\s*[-*]\s+", re.MULTILINE), ""), # list items
    (re.compile(r"---+"), ""),                       # horizontal rules
    (re.compile(r"\n{3,}"), "\n\n"),                 # excessive newlines
]

_MAX_TTS_CHARS = 4000


def strip_markdown(text: str) -> str:
    """Return *text* with markdown stripped for spoken output."""
    for pattern, repl in _MD_PATTERNS:
        text = pattern.sub(repl, text)
    return text.strip()


class TTSPipeline:
    """High-level TTS pipeline that can speak text aloud.

    Parameters
    ----------
    provider:
        TTS backend: ``"edge"``, ``"elevenlabs"``, ``"openai"``, or
        ``"neutts"``.
    voice:
        Voice name / ID for the provider.  ``None`` = provider default.
    on_done:
        Optional callback fired after audio finishes playing.
    """

    def __init__(
        self,
        provider: str = "edge",
        voice: Optional[str] = None,
        on_done: Optional[Callable[[], None]] = None,
    ) -> None:
        self.provider = provider
        self.voice = voice
        self.on_done = on_done

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def speak(self, text: str) -> bool:
        """Speak *text* synchronously.  Returns ``True`` on success."""
        clean = strip_markdown(text[:_MAX_TTS_CHARS])
        if not clean:
            return False
        return self._synthesise_and_play(clean)

    def speak_async(self, text: str) -> None:
        """Speak *text* in a background thread."""
        import threading
        t = threading.Thread(target=self._speak_worker, args=(text,), daemon=True)
        t.start()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _speak_worker(self, text: str) -> None:
        try:
            self.speak(text)
        except Exception:
            logger.exception("TTSPipeline speak_async worker raised")
        finally:
            if self.on_done:
                try:
                    self.on_done()
                except Exception:
                    logger.exception("TTSPipeline on_done callback raised")

    def _synthesise_and_play(self, text: str) -> bool:
        try:
            from tools.tts_tool import text_to_speech_tool
            from tools.voice_mode import play_audio_file

            out_dir = os.path.join(tempfile.gettempdir(), "hermes_voice")
            os.makedirs(out_dir, exist_ok=True)
            from datetime import datetime as _dt
            mp3_path = os.path.join(
                out_dir,
                f"tts_{_dt.now().strftime('%Y%m%d_%H%M%S_%f')}.mp3",
            )

            kwargs: Dict[str, Any] = {"text": text, "output_path": mp3_path}
            if self.provider:
                kwargs["provider"] = self.provider
            if self.voice:
                kwargs["voice"] = self.voice

            text_to_speech_tool(**kwargs)

            if os.path.isfile(mp3_path) and os.path.getsize(mp3_path) > 0:
                played = play_audio_file(mp3_path)
                self._cleanup(mp3_path)
                return played

            # Fallback: check OGG (some providers auto-convert)
            ogg_path = mp3_path.rsplit(".", 1)[0] + ".ogg"
            if os.path.isfile(ogg_path) and os.path.getsize(ogg_path) > 0:
                played = play_audio_file(ogg_path)
                self._cleanup(ogg_path)
                return played

            logger.warning("TTSPipeline: no audio file generated at %s", mp3_path)
            return False
        except Exception as exc:
            logger.error("TTSPipeline._synthesise_and_play: %s", exc)
            return False

    @staticmethod
    def _cleanup(*paths: str) -> None:
        for p in paths:
            try:
                if os.path.isfile(p):
                    os.unlink(p)
            except OSError:
                pass

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_config(
        cls,
        config: Dict[str, Any],
        on_done: Optional[Callable[[], None]] = None,
    ) -> "TTSPipeline":
        """Build a :class:`TTSPipeline` from a Hermes config dict."""
        tts_cfg = config.get("tts", {})
        provider = tts_cfg.get("provider", "edge")
        provider_cfg = tts_cfg.get(provider, {})
        voice: Optional[str] = None
        if isinstance(provider_cfg, dict):
            voice = provider_cfg.get("voice") or provider_cfg.get("voice_id")
        return cls(provider=provider, voice=voice, on_done=on_done)

    # ------------------------------------------------------------------
    # Availability check
    # ------------------------------------------------------------------

    @staticmethod
    def check_provider(provider: str) -> Dict[str, Any]:
        """Return ``{"available": bool, "reason": str}`` for *provider*."""
        if provider == "edge":
            try:
                import edge_tts  # noqa: F401
                return {"available": True, "reason": ""}
            except ImportError:
                return {
                    "available": False,
                    "reason": "edge-tts not installed.  Run: pip install edge-tts",
                }
        if provider == "elevenlabs":
            if os.environ.get("ELEVENLABS_API_KEY"):
                return {"available": True, "reason": ""}
            return {"available": False, "reason": "ELEVENLABS_API_KEY not set"}
        if provider == "openai":
            key = os.environ.get("VOICE_TOOLS_OPENAI_KEY") or os.environ.get("OPENAI_API_KEY")
            if key:
                return {"available": True, "reason": ""}
            return {"available": False, "reason": "VOICE_TOOLS_OPENAI_KEY (or OPENAI_API_KEY) not set"}
        if provider == "neutts":
            try:
                import neutts  # noqa: F401
                return {"available": True, "reason": ""}
            except ImportError:
                return {
                    "available": False,
                    "reason": "neutts not installed.  Run: pip install neutts",
                }
        return {"available": False, "reason": f"Unknown TTS provider: {provider!r}"}
