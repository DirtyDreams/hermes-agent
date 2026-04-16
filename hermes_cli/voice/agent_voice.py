"""Voice Agent Orchestrator for Hermes CLI.

Wires together the VAD, STT, intent dispatcher, and TTS pipeline into a single
high-level object that the CLI can start/stop with a few lines of code.

Typical usage
-------------
.. code-block:: python

    agent = VoiceAgent.from_config(config)
    agent.on_transcript = lambda text: cli.submit_message(text)
    agent.start()          # starts recording loop
    # ... user speaks ...
    agent.stop()           # stops recording and TTS

Architecture
------------
1. :class:`~hermes_cli.voice.vad.VadDetector` watches RMS level from the
   :class:`~tools.voice_mode.AudioRecorder` and fires ``on_speech_end`` when
   an utterance ends.
2. :meth:`VoiceAgent._on_utterance_end` is called; the recorder is stopped and
   the audio written to a WAV file.
3. :class:`~hermes_cli.voice.stt_pipeline.STTPipeline` transcribes the WAV.
4. :class:`~hermes_cli.voice.intents.IntentDispatcher` checks for voice
   commands.  If one matches, the handler is called and no further processing
   happens.
5. If no intent matched, ``on_transcript`` is called with the text so the CLI
   can forward it to the agent.
6. When the agent produces a response, the caller can call
   :meth:`VoiceAgent.speak` to read it aloud via the
   :class:`~hermes_cli.voice.tts_pipeline.TTSPipeline`.
7. After TTS finishes (or immediately if TTS is disabled), a new recording
   cycle begins automatically when ``continuous=True``.

Configuration (``~/.hermes/config.yaml``)
-----------------------------------------
.. code-block:: yaml

    voice:
      record_key: ctrl+b
      auto_tts: false
      silence_threshold: 200
      silence_duration: 3.0
      intents:
        stop: ["stop", "stop agent"]
    stt:
      provider: local
      language: ""
    tts:
      provider: edge
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)


class VoiceAgent:
    """High-level voice agent that manages the full recording → response cycle.

    Parameters
    ----------
    stt:
        An :class:`~hermes_cli.voice.stt_pipeline.STTPipeline` instance.
    tts:
        A :class:`~hermes_cli.voice.tts_pipeline.TTSPipeline` instance or
        ``None`` to disable TTS output.
    intents:
        An :class:`~hermes_cli.voice.intents.IntentDispatcher` or ``None``
        to skip intent matching.
    continuous:
        If ``True`` (default), automatically start a new recording cycle after
        each utterance / TTS playback finishes.
    on_transcript:
        Callback called with the final transcript when no intent matched.
    on_partial_transcript:
        Callback called with intermediate transcript text (best-effort).
    on_recording_start:
        Callback called when recording begins.
    on_recording_stop:
        Callback called when recording ends (before transcription).
    on_error:
        Callback called with an error message string when something fails.
    """

    def __init__(
        self,
        stt: "STTPipeline",  # type: ignore[name-defined]  # noqa: F821
        tts: Optional["TTSPipeline"] = None,  # type: ignore[name-defined]  # noqa: F821
        intents: Optional["IntentDispatcher"] = None,  # type: ignore[name-defined]  # noqa: F821
        continuous: bool = True,
        on_transcript: Optional[Callable[[str], None]] = None,
        on_partial_transcript: Optional[Callable[[str], None]] = None,
        on_recording_start: Optional[Callable[[], None]] = None,
        on_recording_stop: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ) -> None:
        self.stt = stt
        self.tts = tts
        self.intents = intents
        self.continuous = continuous

        self.on_transcript = on_transcript
        self.on_partial_transcript = on_partial_transcript
        self.on_recording_start = on_recording_start
        self.on_recording_stop = on_recording_stop
        self.on_error = on_error

        self._lock = threading.Lock()
        self._active = False
        self._recorder: Optional[Any] = None
        self._vad: Optional[Any] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the voice agent recording loop.

        Raises
        ------
        RuntimeError
            If voice requirements (audio libraries) are not met.
        """
        with self._lock:
            if self._active:
                logger.debug("VoiceAgent.start() called but already active")
                return
            self._active = True

        self._begin_recording_cycle()

    def stop(self) -> None:
        """Stop the voice agent and any active recording/TTS."""
        with self._lock:
            if not self._active:
                return
            self._active = False

        self._stop_recording()
        if self.tts:
            # Interrupt any ongoing TTS
            try:
                from tools.voice_mode import stop_playback
                stop_playback()
            except Exception:
                pass
        logger.debug("VoiceAgent stopped")

    def speak(self, text: str) -> None:
        """Speak *text* via TTS (non-blocking)."""
        if self.tts is None:
            return
        done_event = threading.Event()
        done_event.set()

        def _on_done() -> None:
            done_event.set()
            if self._active and self.continuous:
                self._begin_recording_cycle()

        self.tts.on_done = _on_done
        done_event.clear()
        self.tts.speak_async(text)

    def is_active(self) -> bool:
        """Return whether the voice agent is currently running."""
        return self._active

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _begin_recording_cycle(self) -> None:
        """Start a new recording cycle in a background thread."""
        t = threading.Thread(
            target=self._recording_worker,
            daemon=True,
            name="hermes-voice-agent",
        )
        t.start()

    def _recording_worker(self) -> None:
        """Background thread: record → STT → dispatch."""
        if not self._active:
            return
        try:
            self._record_utterance()
        except Exception as exc:
            logger.error("VoiceAgent recording worker error: %s", exc)
            self._fire_error(str(exc))

    def _record_utterance(self) -> None:
        from tools.voice_mode import AudioRecorder, check_voice_requirements

        reqs = check_voice_requirements()
        if not reqs.get("available"):
            reasons = "; ".join(reqs.get("warnings", ["Unknown error"]))
            self._fire_error(f"Voice not available: {reasons}")
            return

        recorder = AudioRecorder()
        with self._lock:
            self._recorder = recorder

        # VAD setup
        from hermes_cli.voice.vad import VadDetector
        utterance_done = threading.Event()

        def _on_speech_end() -> None:
            utterance_done.set()

        vad = VadDetector(on_speech_end=_on_speech_end)

        # Notify caller
        self._fire_recording_start()

        recorder.start()
        vad.start(recorder)

        # Wait for VAD to detect end of utterance or agent stop
        while not utterance_done.is_set() and self._active:
            import time
            time.sleep(0.05)

        vad.stop()
        wav_path = recorder.stop()

        with self._lock:
            self._recorder = None

        self._fire_recording_stop()

        if not self._active:
            return

        if wav_path is None:
            logger.debug("VoiceAgent: recorder returned no audio (too short / silent)")
            if self.continuous and self._active:
                self._begin_recording_cycle()
            return

        self._transcribe_and_dispatch(wav_path)

    def _transcribe_and_dispatch(self, wav_path: str) -> None:
        """Transcribe *wav_path* and dispatch the result."""
        result = self.stt.transcribe(wav_path)

        if not result["success"] or not result["transcript"]:
            if result.get("error"):
                self._fire_error(f"STT failed: {result['error']}")
            if self.continuous and self._active:
                self._begin_recording_cycle()
            return

        transcript = result["transcript"].strip()
        logger.debug("VoiceAgent transcript: %r", transcript)

        if self.on_partial_transcript:
            try:
                self.on_partial_transcript(transcript)
            except Exception:
                logger.exception("on_partial_transcript callback raised")

        # Intent dispatch
        if self.intents and self.intents.dispatch(transcript):
            logger.debug("VoiceAgent: intent handled, skipping on_transcript")
            return

        # Forward to agent
        if self.on_transcript:
            try:
                self.on_transcript(transcript)
            except Exception:
                logger.exception("on_transcript callback raised")

    def _stop_recording(self) -> None:
        with self._lock:
            recorder = self._recorder
        if recorder is not None:
            try:
                recorder.cancel()
            except Exception:
                pass

    def _fire_recording_start(self) -> None:
        if self.on_recording_start:
            try:
                self.on_recording_start()
            except Exception:
                logger.exception("on_recording_start callback raised")

    def _fire_recording_stop(self) -> None:
        if self.on_recording_stop:
            try:
                self.on_recording_stop()
            except Exception:
                logger.exception("on_recording_stop callback raised")

    def _fire_error(self, msg: str) -> None:
        logger.error("VoiceAgent error: %s", msg)
        if self.on_error:
            try:
                self.on_error(msg)
            except Exception:
                logger.exception("on_error callback raised")

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_config(
        cls,
        config: Dict[str, Any],
        on_transcript: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ) -> "VoiceAgent":
        """Build a :class:`VoiceAgent` from a Hermes config dict."""
        from hermes_cli.voice.stt_pipeline import STTPipeline
        from hermes_cli.voice.tts_pipeline import TTSPipeline
        from hermes_cli.voice.intents import IntentDispatcher

        stt = STTPipeline.from_config(config)
        tts = TTSPipeline.from_config(config) if config.get("tts") else None
        intents = IntentDispatcher.from_config(config)

        voice_cfg = config.get("voice", {})
        continuous = voice_cfg.get("continuous", True)

        return cls(
            stt=stt,
            tts=tts,
            intents=intents,
            continuous=continuous,
            on_transcript=on_transcript,
            on_error=on_error,
        )
