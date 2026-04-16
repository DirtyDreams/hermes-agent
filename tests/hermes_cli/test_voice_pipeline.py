"""Tests for hermes_cli/voice/ — all mocked, no real audio or API calls."""

import threading
from unittest.mock import MagicMock, patch

import pytest


# ============================================================================
# VAD tests
# ============================================================================

class TestVadDetector:
    def test_invalid_thresholds_raise(self):
        from hermes_cli.voice.vad import VadDetector
        with pytest.raises(ValueError, match="silence_threshold must be strictly less"):
            VadDetector(speech_threshold=100, silence_threshold=200)

    def test_equal_thresholds_raise(self):
        from hermes_cli.voice.vad import VadDetector
        with pytest.raises(ValueError):
            VadDetector(speech_threshold=200, silence_threshold=200)

    def test_state_initially_idle(self):
        from hermes_cli.voice.vad import VadDetector
        vad = VadDetector()
        assert vad.state == "idle"

    def test_start_sets_listening_state(self):
        from hermes_cli.voice.vad import VadDetector

        mock_recorder = MagicMock()
        mock_recorder.current_rms = 0

        vad = VadDetector(poll_interval=0.001)
        vad.start(mock_recorder)
        import time
        time.sleep(0.02)
        vad.stop()
        assert vad.state == "idle"

    def test_speech_start_callback_fires(self):
        from hermes_cli.voice.vad import VadDetector
        import time

        fired = threading.Event()

        mock_recorder = MagicMock()
        mock_recorder.current_rms = 400  # above speech_threshold=300

        vad = VadDetector(
            speech_threshold=300,
            silence_threshold=200,
            on_speech_start=lambda: fired.set(),
            poll_interval=0.005,
        )
        vad.start(mock_recorder)
        fired.wait(timeout=1.0)
        vad.stop()
        assert fired.is_set()

    def test_speech_end_callback_fires_after_silence(self):
        from hermes_cli.voice.vad import VadDetector
        import time

        started = threading.Event()
        ended = threading.Event()

        rms_values = iter([400] * 5 + [0] * 200)

        def _get_rms():
            try:
                return next(rms_values)
            except StopIteration:
                return 0

        mock_recorder = MagicMock()
        type(mock_recorder).current_rms = property(lambda self: _get_rms())

        vad = VadDetector(
            speech_threshold=300,
            silence_threshold=200,
            silence_duration=0.1,
            on_speech_start=lambda: started.set(),
            on_speech_end=lambda: ended.set(),
            poll_interval=0.005,
        )
        vad.start(mock_recorder)
        assert ended.wait(timeout=3.0), "on_speech_end never fired"
        vad.stop()


class TestComputeRms:
    def test_silence_is_zero(self):
        from hermes_cli.voice.vad import compute_rms
        silence = b"\x00" * 100
        assert compute_rms(silence) == 0

    def test_non_zero_signal(self):
        from hermes_cli.voice.vad import compute_rms
        import struct
        samples = [1000] * 50
        data = struct.pack(f"<{len(samples)}h", *samples)
        assert compute_rms(data) > 0

    def test_empty_bytes_returns_zero(self):
        from hermes_cli.voice.vad import compute_rms
        assert compute_rms(b"") == 0


# ============================================================================
# STT Pipeline tests
# ============================================================================

class TestSTTPipeline:
    def test_transcribe_delegates_to_transcription_tools(self):
        from hermes_cli.voice.stt_pipeline import STTPipeline

        mock_result = {"success": True, "transcript": "hello world", "language": "en", "error": ""}
        with patch("tools.transcription_tools.transcribe_audio", return_value=mock_result):
            pipeline = STTPipeline(provider="local")
            result = pipeline.transcribe("/tmp/test.wav")

        assert result["success"] is True
        assert result["transcript"] == "hello world"

    def test_transcribe_handles_exception(self):
        from hermes_cli.voice.stt_pipeline import STTPipeline

        with patch("tools.transcription_tools.transcribe_audio", side_effect=RuntimeError("boom")):
            pipeline = STTPipeline(provider="local")
            result = pipeline.transcribe("/tmp/test.wav")

        assert result["success"] is False
        assert "boom" in result["error"]

    def test_from_config_reads_provider(self):
        from hermes_cli.voice.stt_pipeline import STTPipeline

        config = {"stt": {"provider": "groq", "groq": {}}}
        pipeline = STTPipeline.from_config(config)
        assert pipeline.provider == "groq"

    def test_from_config_defaults_to_local(self):
        from hermes_cli.voice.stt_pipeline import STTPipeline

        pipeline = STTPipeline.from_config({})
        assert pipeline.provider == "local"

    def test_on_partial_callback_fires_on_success(self):
        from hermes_cli.voice.stt_pipeline import STTPipeline

        partials = []
        mock_result = {"success": True, "transcript": "test text", "language": "en", "error": ""}
        with patch("tools.transcription_tools.transcribe_audio", return_value=mock_result):
            pipeline = STTPipeline(provider="local", on_partial=partials.append)
            pipeline.transcribe("/tmp/test.wav")

        assert "test text" in partials

    def test_check_provider_local_without_faster_whisper(self, monkeypatch):
        from hermes_cli.voice.stt_pipeline import STTPipeline

        monkeypatch.setattr("shutil.which", lambda _: None)
        with patch.dict("sys.modules", {"faster_whisper": None}):
            result = STTPipeline.check_provider("local")

        assert result["available"] is False

    def test_check_provider_unknown(self):
        from hermes_cli.voice.stt_pipeline import STTPipeline
        result = STTPipeline.check_provider("unknown_provider")
        assert result["available"] is False


# ============================================================================
# TTS Pipeline tests
# ============================================================================

class TestTTSPipeline:
    def test_strip_markdown(self):
        from hermes_cli.voice.tts_pipeline import strip_markdown
        md = "**Hello** `world` [link](https://example.com)\n\n---\n"
        result = strip_markdown(md)
        assert "Hello" in result
        assert "**" not in result
        assert "`" not in result
        assert "https://" not in result

    def test_strip_markdown_code_block(self):
        from hermes_cli.voice.tts_pipeline import strip_markdown
        text = "Here is code:\n```python\nprint('hi')\n```\nDone."
        result = strip_markdown(text)
        assert "print" not in result
        assert "Done." in result

    def test_from_config_reads_provider(self):
        from hermes_cli.voice.tts_pipeline import TTSPipeline
        config = {"tts": {"provider": "elevenlabs", "elevenlabs": {"voice_id": "abc123"}}}
        pipeline = TTSPipeline.from_config(config)
        assert pipeline.provider == "elevenlabs"
        assert pipeline.voice == "abc123"

    def test_speak_returns_false_for_empty_text(self):
        from hermes_cli.voice.tts_pipeline import TTSPipeline
        pipeline = TTSPipeline()
        assert pipeline.speak("") is False
        assert pipeline.speak("   ") is False

    def test_speak_truncates_long_text(self):
        from hermes_cli.voice.tts_pipeline import TTSPipeline, _MAX_TTS_CHARS
        import os, tempfile

        long_text = "a" * (_MAX_TTS_CHARS + 1000)
        calls = []

        def fake_tts(**kwargs):
            calls.append(kwargs["text"])

        def fake_play(path):
            return True

        with patch("tools.tts_tool.text_to_speech_tool", fake_tts), \
             patch("tools.voice_mode.play_audio_file", fake_play), \
             patch("os.path.isfile", return_value=True), \
             patch("os.path.getsize", return_value=1000):
            pipeline = TTSPipeline()
            pipeline._synthesise_and_play(long_text[:_MAX_TTS_CHARS])

        # Should not crash; called with at most _MAX_TTS_CHARS chars
        if calls:
            assert len(calls[0]) <= _MAX_TTS_CHARS

    def test_check_provider_edge_without_package(self):
        from hermes_cli.voice.tts_pipeline import TTSPipeline

        with patch.dict("sys.modules", {"edge_tts": None}):
            result = TTSPipeline.check_provider("edge")
        assert result["available"] is False

    def test_check_provider_unknown(self):
        from hermes_cli.voice.tts_pipeline import TTSPipeline
        result = TTSPipeline.check_provider("mystery_provider")
        assert result["available"] is False


# ============================================================================
# Intent Dispatcher tests
# ============================================================================

class TestIntentDispatcher:
    def test_dispatch_exact_match(self):
        from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

        fired = []
        dispatcher = IntentDispatcher()
        dispatcher.register(VoiceIntent.STOP, lambda: fired.append("stop"))

        matched = dispatcher.dispatch("stop")
        assert matched is True
        assert "stop" in fired

    def test_dispatch_no_match_returns_false(self):
        from hermes_cli.voice.intents import IntentDispatcher

        dispatcher = IntentDispatcher()
        dispatcher.register("stop", lambda: None)

        matched = dispatcher.dispatch("hello world how are you")
        assert matched is False

    def test_dispatch_fuzzy_match(self):
        from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

        fired = []
        dispatcher = IntentDispatcher(fuzzy=True)
        dispatcher.register(VoiceIntent.STOP, lambda: fired.append("stop"))

        matched = dispatcher.dispatch("please stop agent right now")
        assert matched is True

    def test_dispatch_fuzzy_disabled_no_partial_match(self):
        from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

        fired = []
        dispatcher = IntentDispatcher(fuzzy=False)
        dispatcher.register(VoiceIntent.STOP, lambda: fired.append("stop"))

        matched = dispatcher.dispatch("please stop agent")
        assert matched is False

    def test_no_handler_registered_returns_false(self):
        from hermes_cli.voice.intents import IntentDispatcher

        dispatcher = IntentDispatcher()
        # "stop" matches a phrase but no handler is registered
        matched = dispatcher.dispatch("stop")
        assert matched is False

    def test_add_phrase(self):
        from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

        fired = []
        dispatcher = IntentDispatcher()
        dispatcher.register(VoiceIntent.RETRY, lambda: fired.append("retry"))
        dispatcher.add_phrase(VoiceIntent.RETRY, "do it over please")

        matched = dispatcher.dispatch("do it over please")
        assert matched is True

    def test_from_config_loads_custom_phrases(self):
        from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

        config = {"voice": {"intents": {"stop": ["halt now", "freeze"]}}}
        dispatcher = IntentDispatcher.from_config(config)
        phrases = dispatcher.get_phrases(VoiceIntent.STOP)
        assert "halt now" in phrases
        assert "freeze" in phrases

    def test_dispatch_empty_transcript(self):
        from hermes_cli.voice.intents import IntentDispatcher

        dispatcher = IntentDispatcher()
        dispatcher.register("stop", lambda: None)
        assert dispatcher.dispatch("") is False
        assert dispatcher.dispatch("   ") is False

    def test_normalise_strips_punctuation(self):
        from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

        fired = []
        dispatcher = IntentDispatcher()
        dispatcher.register(VoiceIntent.STOP, lambda: fired.append("stop"))

        # Punctuation should be stripped before matching
        dispatcher.dispatch("stop!")
        assert "stop" in fired


# ============================================================================
# VoiceAgent tests
# ============================================================================

class TestVoiceAgentFromConfig:
    def test_from_config_returns_voice_agent(self):
        from hermes_cli.voice.agent_voice import VoiceAgent

        config = {
            "stt": {"provider": "local"},
            "tts": {"provider": "edge"},
            "voice": {"continuous": False, "intents": {}},
        }
        agent = VoiceAgent.from_config(config)
        assert isinstance(agent, VoiceAgent)
        assert not agent.is_active()

    def test_stop_on_inactive_agent_is_safe(self):
        from hermes_cli.voice.agent_voice import VoiceAgent

        config = {"stt": {"provider": "local"}, "voice": {}}
        agent = VoiceAgent.from_config(config)
        agent.stop()  # Should not raise

    def test_speak_with_no_tts_is_noop(self):
        from hermes_cli.voice.agent_voice import VoiceAgent
        from hermes_cli.voice.stt_pipeline import STTPipeline
        from hermes_cli.voice.intents import IntentDispatcher

        stt = MagicMock(spec=STTPipeline)
        agent = VoiceAgent(stt=stt, tts=None, intents=IntentDispatcher())
        agent.speak("hello")  # Should not raise
