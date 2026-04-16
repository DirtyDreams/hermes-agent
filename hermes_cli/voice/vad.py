"""Voice Activity Detection (VAD) for Hermes Voice Agent Mode.

Provides silence-based endpoint detection so the agent knows when the user
has finished speaking.  All processing is done in-process; no external
dependencies beyond NumPy (which is already an optional audio dep).

Public API
----------
VadDetector  — wraps an AudioRecorder and fires a callback when speech ends.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class VadDetector:
    """Monitors an :class:`AudioRecorder` stream and detects speech endpoints.

    The detector runs a background thread that polls the recorder's current RMS
    level.  Once speech is detected (RMS exceeds *speech_threshold*) a timer
    starts.  When the RMS falls below *silence_threshold* for at least
    *silence_duration* seconds the *on_speech_end* callback is fired.

    Parameters
    ----------
    speech_threshold:
        RMS level (0–32767) above which audio is considered speech.
    silence_threshold:
        RMS level below which audio is considered silence.
    silence_duration:
        How long (seconds) the signal must remain silent before the utterance
        is considered complete.
    on_speech_start:
        Called (once per utterance) when speech is first detected.
    on_speech_end:
        Called when the utterance ends (silence detected for long enough).
    poll_interval:
        How often (seconds) to sample the RMS level.
    """

    def __init__(
        self,
        speech_threshold: int = 300,
        silence_threshold: int = 200,
        silence_duration: float = 1.5,
        on_speech_start: Optional[Callable[[], None]] = None,
        on_speech_end: Optional[Callable[[], None]] = None,
        poll_interval: float = 0.05,
    ) -> None:
        if silence_threshold >= speech_threshold:
            raise ValueError(
                "silence_threshold must be strictly less than speech_threshold"
            )
        self.speech_threshold = speech_threshold
        self.silence_threshold = silence_threshold
        self.silence_duration = silence_duration
        self.on_speech_start = on_speech_start
        self.on_speech_end = on_speech_end
        self.poll_interval = poll_interval

        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._state = "idle"  # idle | listening | speaking | silence_gap

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def start(self, recorder: "AudioRecorder") -> None:  # type: ignore[name-defined]  # noqa: F821
        """Start VAD monitoring against *recorder*.

        The recorder must already be started (i.e. its stream is open).
        """
        self._stop_event.clear()
        self._state = "listening"
        self._thread = threading.Thread(
            target=self._run,
            args=(recorder,),
            daemon=True,
            name="hermes-vad",
        )
        self._thread.start()
        logger.debug("VAD started (speech_thresh=%d silence_thresh=%d duration=%.1fs)",
                     self.speech_threshold, self.silence_threshold, self.silence_duration)

    def stop(self) -> None:
        """Stop VAD monitoring.  Blocks until the background thread exits."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._state = "idle"
        logger.debug("VAD stopped")

    @property
    def state(self) -> str:
        """Current state: ``idle``, ``listening``, ``speaking``, ``silence_gap``."""
        return self._state

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run(self, recorder: "AudioRecorder") -> None:  # type: ignore[name-defined]  # noqa: F821
        silence_start: Optional[float] = None
        speech_detected = False

        while not self._stop_event.is_set():
            rms = recorder.current_rms

            if rms >= self.speech_threshold:
                if not speech_detected:
                    speech_detected = True
                    self._state = "speaking"
                    logger.debug("VAD: speech started (rms=%d)", rms)
                    if self.on_speech_start:
                        try:
                            self.on_speech_start()
                        except Exception:
                            logger.exception("VAD on_speech_start callback raised")
                silence_start = None

            elif speech_detected and rms < self.silence_threshold:
                if silence_start is None:
                    silence_start = time.monotonic()
                    self._state = "silence_gap"
                    logger.debug("VAD: silence gap started (rms=%d)", rms)
                elif time.monotonic() - silence_start >= self.silence_duration:
                    logger.debug("VAD: speech ended after %.1fs silence", self.silence_duration)
                    self._state = "idle"
                    speech_detected = False
                    silence_start = None
                    if self.on_speech_end:
                        try:
                            self.on_speech_end()
                        except Exception:
                            logger.exception("VAD on_speech_end callback raised")
                    # Reset for next utterance
                    self._state = "listening"
            else:
                silence_start = None

            time.sleep(self.poll_interval)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def compute_rms(audio_bytes: bytes, sample_width: int = 2) -> int:
    """Compute RMS from raw PCM bytes.

    Parameters
    ----------
    audio_bytes:
        Raw PCM audio bytes (little-endian signed integers).
    sample_width:
        Bytes per sample (1 = 8-bit, 2 = 16-bit, 4 = 32-bit).

    Returns
    -------
    int
        RMS value in the range 0–32767 (for 16-bit audio).
    """
    if not audio_bytes:
        return 0
    try:
        import struct
        import math
        fmt = {1: "b", 2: "h", 4: "i"}.get(sample_width, "h")
        n_samples = len(audio_bytes) // sample_width
        if n_samples == 0:
            return 0
        samples = struct.unpack(f"<{n_samples}{fmt}", audio_bytes[:n_samples * sample_width])
        rms = math.sqrt(sum(s * s for s in samples) / n_samples)
        return int(rms)
    except Exception:
        return 0
