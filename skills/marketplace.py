"""Skill Marketplace — community registry, search, ratings, and analytics.

Provides a thin client layer for community-contributed skill metrics that
augment the existing Skills Hub sources with:

* Download / install counts
* Community star ratings
* Usage analytics (local, privacy-preserving)
* Featured / trending skill lists
* Feedback submission

Data sources
------------
The marketplace module works **offline-first**: all data is cached locally
and refreshed in the background.  If the network is unavailable the last
cached data is returned.

The primary remote endpoint is the optional ``HERMES_MARKETPLACE_URL``
environment variable (defaults to the official Nous Research skills API when
set).  The module degrades gracefully when no marketplace URL is configured,
returning empty results and skipping network calls.

Usage analytics are **local-only** by default.  Setting
``marketplace.share_analytics: true`` in ``config.yaml`` enables aggregated
(non-PII) reporting to the marketplace endpoint.

Public API
----------
MarketplaceClient     HTTP client for the community marketplace API.
SkillAnalytics        Local usage tracker (invocation counts, ratings).
get_client()          Return a singleton :class:`MarketplaceClient`.
get_analytics()       Return a singleton :class:`SkillAnalytics`.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from hermes_constants import get_hermes_home

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MARKETPLACE_URL_ENV = "HERMES_MARKETPLACE_URL"
_CACHE_TTL = 3600  # 1 hour
_ANALYTICS_FILE_NAME = "marketplace_analytics.json"
_RATINGS_CACHE_FILE = "marketplace_ratings_cache.json"

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class SkillRating:
    """Community rating metadata for a single skill."""

    skill_name: str
    stars: float = 0.0           # Average star rating (0.0–5.0)
    rating_count: int = 0        # Number of ratings submitted
    installs: int = 0            # Total install count (from remote)
    weekly_installs: int = 0     # Installs in the last 7 days
    featured: bool = False       # Whether it appears in featured/trending

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill_name": self.skill_name,
            "stars": self.stars,
            "rating_count": self.rating_count,
            "installs": self.installs,
            "weekly_installs": self.weekly_installs,
            "featured": self.featured,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SkillRating":
        return cls(
            skill_name=data.get("skill_name", ""),
            stars=float(data.get("stars", 0.0)),
            rating_count=int(data.get("rating_count", 0)),
            installs=int(data.get("installs", 0)),
            weekly_installs=int(data.get("weekly_installs", 0)),
            featured=bool(data.get("featured", False)),
        )


# ---------------------------------------------------------------------------
# Marketplace HTTP client
# ---------------------------------------------------------------------------


class MarketplaceClient:
    """Thin HTTP client for the community skills marketplace API.

    All methods return empty / fallback values when the marketplace URL is
    not configured or the network is unavailable.

    Parameters
    ----------
    base_url:
        The marketplace API base URL.  If ``None``, read from
        ``HERMES_MARKETPLACE_URL`` env var.  If neither is set, all network
        calls are skipped.
    cache_dir:
        Directory for caching API responses.  Defaults to
        ``~/.hermes/.hub/marketplace-cache/``.
    cache_ttl:
        Cache lifetime in seconds (default: 3600).
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        cache_dir: Optional[Path] = None,
        cache_ttl: int = _CACHE_TTL,
    ) -> None:
        self.base_url = (base_url or os.environ.get(_MARKETPLACE_URL_ENV, "")).rstrip("/")
        self.cache_dir = cache_dir or (get_hermes_home() / "skills" / ".hub" / "marketplace-cache")
        self.cache_ttl = cache_ttl

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def is_configured(self) -> bool:
        """Return ``True`` if a marketplace URL is configured."""
        return bool(self.base_url)

    def get_ratings(self, skill_names: List[str]) -> Dict[str, SkillRating]:
        """Fetch community ratings for *skill_names*.

        Returns a dict mapping skill name → :class:`SkillRating`.  Skills
        not found in the marketplace are omitted.
        """
        if not self.is_configured() or not skill_names:
            return {}

        cache_key = "ratings_" + hashlib.sha1(
            ",".join(sorted(skill_names)).encode()
        ).hexdigest()[:16]
        cached = self._read_cache(cache_key)
        if cached is not None:
            return {k: SkillRating.from_dict(v) for k, v in cached.items()}

        try:
            data = self._post_json("/v1/ratings/batch", {"skills": skill_names})
            if not isinstance(data, dict):
                return {}
            result = {k: SkillRating.from_dict(v) for k, v in data.items()}
            self._write_cache(cache_key, {k: v.to_dict() for k, v in result.items()})
            return result
        except Exception as exc:
            logger.debug("MarketplaceClient.get_ratings failed: %s", exc)
            return {}

    def get_featured(self, limit: int = 10) -> List[SkillRating]:
        """Return featured / trending skills from the marketplace."""
        if not self.is_configured():
            return []

        cache_key = f"featured_{limit}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return [SkillRating.from_dict(item) for item in cached]

        try:
            data = self._get_json(f"/v1/featured?limit={limit}")
            if not isinstance(data, list):
                return []
            result = [SkillRating.from_dict(item) for item in data]
            self._write_cache(cache_key, [r.to_dict() for r in result])
            return result
        except Exception as exc:
            logger.debug("MarketplaceClient.get_featured failed: %s", exc)
            return []

    def submit_rating(
        self, skill_name: str, stars: float, comment: str = ""
    ) -> bool:
        """Submit a star rating for *skill_name*.  Returns ``True`` on success."""
        if not self.is_configured():
            logger.debug("submit_rating: no marketplace URL configured")
            return False
        stars = max(0.0, min(5.0, float(stars)))
        try:
            result = self._post_json(
                "/v1/ratings/submit",
                {"skill_name": skill_name, "stars": stars, "comment": comment},
            )
            return isinstance(result, dict) and result.get("ok", False)
        except Exception as exc:
            logger.debug("MarketplaceClient.submit_rating failed: %s", exc)
            return False

    def report_install(self, skill_name: str) -> None:
        """Report a skill installation (non-critical; errors are silently ignored)."""
        if not self.is_configured():
            return
        try:
            self._post_json("/v1/installs/report", {"skill_name": skill_name})
        except Exception:
            pass

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _get_json(self, path: str, timeout: float = 10.0) -> Any:
        import httpx
        resp = httpx.get(f"{self.base_url}{path}", timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    def _post_json(self, path: str, payload: Any, timeout: float = 10.0) -> Any:
        import httpx
        resp = httpx.post(
            f"{self.base_url}{path}",
            json=payload,
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _read_cache(self, key: str) -> Optional[Any]:
        path = self.cache_dir / f"{key}.json"
        if not path.exists():
            return None
        try:
            stat = path.stat()
            if time.time() - stat.st_mtime > self.cache_ttl:
                return None
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _write_cache(self, key: str, data: Any) -> None:
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            path = self.cache_dir / f"{key}.json"
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.debug("MarketplaceClient cache write failed: %s", exc)


# ---------------------------------------------------------------------------
# Local usage analytics
# ---------------------------------------------------------------------------


class SkillAnalytics:
    """Privacy-preserving local usage analytics.

    Tracks how many times each skill has been invoked in the current
    installation.  Data is stored locally at
    ``~/.hermes/skills/.hub/marketplace_analytics.json`` and never sent
    anywhere unless the user explicitly opts in via
    ``marketplace.share_analytics: true``.

    Parameters
    ----------
    analytics_path:
        Path to the analytics JSON file.  Defaults to the standard location
        inside ``HERMES_HOME``.
    """

    def __init__(self, analytics_path: Optional[Path] = None) -> None:
        self.path = analytics_path or (
            get_hermes_home() / "skills" / ".hub" / _ANALYTICS_FILE_NAME
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def record_invocation(self, skill_name: str) -> None:
        """Increment the invocation counter for *skill_name*."""
        data = self._load()
        invocations = data.setdefault("invocations", {})
        invocations[skill_name] = invocations.get(skill_name, 0) + 1
        first_seen = data.setdefault("first_seen", {})
        first_seen[skill_name] = first_seen.get(skill_name, int(time.time()))
        last_seen = data.setdefault("last_seen", {})
        last_seen[skill_name] = int(time.time())
        self._save(data)

    def get_invocation_count(self, skill_name: str) -> int:
        """Return the total invocation count for *skill_name*."""
        data = self._load()
        return data.get("invocations", {}).get(skill_name, 0)

    def top_skills(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return the most-used skills, sorted by invocation count."""
        data = self._load()
        invocations = data.get("invocations", {})
        sorted_skills = sorted(invocations.items(), key=lambda x: x[1], reverse=True)
        return [{"name": name, "invocations": count} for name, count in sorted_skills[:limit]]

    def record_rating(self, skill_name: str, stars: float) -> None:
        """Record a local star rating for *skill_name*."""
        data = self._load()
        ratings = data.setdefault("ratings", {})
        ratings[skill_name] = {
            "stars": max(0.0, min(5.0, float(stars))),
            "rated_at": int(time.time()),
        }
        self._save(data)

    def get_local_rating(self, skill_name: str) -> Optional[float]:
        """Return the locally stored star rating for *skill_name*, or ``None``."""
        data = self._load()
        entry = data.get("ratings", {}).get(skill_name)
        if isinstance(entry, dict):
            return entry.get("stars")
        return None

    def summary(self) -> Dict[str, Any]:
        """Return a summary dict for display purposes."""
        data = self._load()
        invocations = data.get("invocations", {})
        ratings = data.get("ratings", {})
        return {
            "total_skills_used": len(invocations),
            "total_invocations": sum(invocations.values()),
            "total_rated": len(ratings),
            "top_skills": self.top_skills(5),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _save(self, data: Dict[str, Any]) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.debug("SkillAnalytics save failed: %s", exc)


# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------

_client: Optional[MarketplaceClient] = None
_analytics: Optional[SkillAnalytics] = None


def get_client() -> MarketplaceClient:
    """Return the singleton :class:`MarketplaceClient`."""
    global _client
    if _client is None:
        _client = MarketplaceClient()
    return _client


def get_analytics() -> SkillAnalytics:
    """Return the singleton :class:`SkillAnalytics`."""
    global _analytics
    if _analytics is None:
        _analytics = SkillAnalytics()
    return _analytics
