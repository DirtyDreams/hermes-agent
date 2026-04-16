"""Voice Agent Mode — real-time speech pipeline for Hermes CLI.

Sub-modules
-----------
vad         Voice Activity Detection (silence-based endpoint detection)
stt_pipeline  Streaming Speech-to-Text (Whisper / Groq / OpenAI)
tts_pipeline  Text-to-Speech output (Edge TTS / ElevenLabs / OpenAI / NeuTTS)
intents     Voice command dispatch (custom hotword → action mapping)
agent_voice Core orchestrator that wires VAD → STT → agent → TTS
"""

from hermes_cli.voice.agent_voice import VoiceAgent
from hermes_cli.voice.intents import IntentDispatcher, VoiceIntent

__all__ = ["VoiceAgent", "IntentDispatcher", "VoiceIntent"]
