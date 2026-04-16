"""Voice Intent Dispatcher for Hermes Voice Agent Mode.

Maps spoken command phrases to named intents and dispatches them to handler
functions registered by the application.

Typical usage
-------------
.. code-block:: python

    dispatcher = IntentDispatcher.from_config(config)
    dispatcher.register(VoiceIntent.STOP, lambda: agent.stop())
    dispatcher.register(VoiceIntent.RETRY, lambda: agent.retry())

    # After transcription:
    if not dispatcher.dispatch(transcript):
        agent.send_message(transcript)

Built-in Intents
----------------
STOP        Stop the current agent run (maps to ``/stop`` command).
RETRY       Retry the last message.
SUMMARIZE   Ask the agent to summarise the conversation.
CLEAR       Start a new session.
STATUS      Show session status.
HELP        Show help information.

Configuration (``~/.hermes/config.yaml``)
-----------------------------------------
.. code-block:: yaml

    voice:
      intents:
        stop:    ["stop", "stop agent", "cancel", "halt"]
        retry:   ["retry", "try again", "repeat"]
        summarize: ["summarize", "summary", "give me a summary"]
        clear:   ["clear", "new session", "start over"]
        status:  ["status", "what's the status"]
        help:    ["help", "show help"]
"""

from __future__ import annotations

import logging
import re
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class VoiceIntent(str, Enum):
    """Named voice intents understood by the dispatcher."""
    STOP = "stop"
    RETRY = "retry"
    SUMMARIZE = "summarize"
    CLEAR = "clear"
    STATUS = "status"
    HELP = "help"
    CUSTOM = "custom"   # user-defined intents


# Default phrase → intent mapping (all lowercase)
DEFAULT_PHRASES: Dict[str, List[str]] = {
    VoiceIntent.STOP: [
        "stop", "stop agent", "cancel", "halt", "abort", "stop it",
        "stop please", "enough", "quiet",
    ],
    VoiceIntent.RETRY: [
        "retry", "try again", "repeat", "do it again", "redo",
    ],
    VoiceIntent.SUMMARIZE: [
        "summarize", "summarise", "summary", "give me a summary",
        "what have we done", "tldr",
    ],
    VoiceIntent.CLEAR: [
        "clear", "new session", "start over", "reset", "fresh start",
        "new conversation",
    ],
    VoiceIntent.STATUS: [
        "status", "what's the status", "show status", "session status",
    ],
    VoiceIntent.HELP: [
        "help", "show help", "what can you do", "list commands",
    ],
}


def _normalise(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text)


class IntentDispatcher:
    """Match transcripts to intents and dispatch to registered handlers.

    Parameters
    ----------
    phrase_map:
        Mapping of intent name → list of trigger phrases.  Matched
        case-insensitively after stripping punctuation.
    fuzzy:
        When ``True`` (default) a transcript *containing* a trigger phrase
        counts as a match (e.g. "please stop now" matches "stop").
        When ``False`` only exact matches are accepted.
    """

    def __init__(
        self,
        phrase_map: Optional[Dict[str, List[str]]] = None,
        fuzzy: bool = True,
    ) -> None:
        self._phrase_map: Dict[str, List[str]] = {}
        self._handlers: Dict[str, Callable[[], None]] = {}
        self.fuzzy = fuzzy

        # Load defaults first, then overlay user overrides
        for intent, phrases in DEFAULT_PHRASES.items():
            key = intent.value if isinstance(intent, VoiceIntent) else str(intent)
            self._phrase_map[key] = [_normalise(p) for p in phrases]

        if phrase_map:
            for intent_name, phrases in phrase_map.items():
                key = intent_name.value if isinstance(intent_name, VoiceIntent) else str(intent_name)
                self._phrase_map[key] = [_normalise(p) for p in phrases]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register(self, intent: "str | VoiceIntent", handler: Callable[[], None]) -> None:
        """Register *handler* to be called when *intent* is matched."""
        key = intent.value if isinstance(intent, VoiceIntent) else str(intent)
        self._handlers[key] = handler

    def dispatch(self, transcript: str) -> bool:
        """Try to match *transcript* to an intent and call its handler.

        Returns
        -------
        bool
            ``True`` if an intent was matched and its handler invoked,
            ``False`` if the transcript should be forwarded to the agent as a
            normal message.
        """
        norm = _normalise(transcript)
        if not norm:
            return False

        matched_intent = self._match(norm)
        if matched_intent is None:
            return False

        handler = self._handlers.get(matched_intent)
        if handler is None:
            logger.debug("Intent '%s' matched but no handler registered", matched_intent)
            return False

        logger.debug("VoiceIntent dispatched: %s (transcript=%r)", matched_intent, transcript)
        try:
            handler()
        except Exception:
            logger.exception("VoiceIntent handler for '%s' raised", matched_intent)
        return True

    def add_phrase(self, intent: "str | VoiceIntent", phrase: str) -> None:
        """Add *phrase* as an additional trigger for *intent* at runtime."""
        key = intent.value if isinstance(intent, VoiceIntent) else str(intent)
        norm = _normalise(phrase)
        if key not in self._phrase_map:
            self._phrase_map[key] = []
        if norm not in self._phrase_map[key]:
            self._phrase_map[key].append(norm)

    def get_phrases(self, intent: "str | VoiceIntent") -> List[str]:
        """Return all trigger phrases registered for *intent*."""
        key = intent.value if isinstance(intent, VoiceIntent) else str(intent)
        return list(self._phrase_map.get(key, []))

    def get_all_intents(self) -> Dict[str, List[str]]:
        """Return a mapping of all intent names to their trigger phrases."""
        return {k: list(v) for k, v in self._phrase_map.items()}

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _match(self, norm: str) -> Optional[str]:
        """Return the intent name whose phrases best match *norm*."""
        # Prefer exact matches
        for intent_name, phrases in self._phrase_map.items():
            if norm in phrases:
                return intent_name

        if self.fuzzy:
            for intent_name, phrases in self._phrase_map.items():
                for phrase in phrases:
                    if phrase in norm:
                        return intent_name

        return None

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_config(
        cls,
        config: Dict[str, Any],
        fuzzy: bool = True,
    ) -> "IntentDispatcher":
        """Build a dispatcher from a Hermes config dict.

        Reads ``config["voice"]["intents"]``.
        """
        voice_cfg = config.get("voice", {})
        intent_cfg = voice_cfg.get("intents", {})
        phrase_map: Dict[str, List[str]] = {}
        for intent_name, phrases in intent_cfg.items():
            if isinstance(phrases, list):
                phrase_map[intent_name] = phrases
            elif isinstance(phrases, str):
                phrase_map[intent_name] = [phrases]
        return cls(phrase_map=phrase_map, fuzzy=fuzzy)
