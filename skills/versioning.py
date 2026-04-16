"""Skill Versioning — semver-aware version tracking and pinning for Hermes skills.

Provides utilities for:

* Parsing and comparing semver / commit-hash version strings
* Pinning installed skills to a specific version
* Resolving the best matching version from a list of available versions
* Generating upgrade / downgrade / rollback decisions

Version Format
--------------
Skills may declare versions in three forms:

1. **Semver** — ``"1.2.3"`` or ``"v1.2.3"``
2. **Short semver** — ``"1.2"`` (treated as ``"1.2.0"``)
3. **Commit hash** — 7-40 hex characters, e.g. ``"a1b2c3d"``
4. **Arbitrary label** — anything else (treated as opaque strings, compared
   lexicographically and always considered "older" than a real semver).

Public API
----------
parse_version(v)          Parse a version string into a :class:`Version`.
Version                   Comparable version object.
VersionPin                Pin record stored in lock.json.
VersionManager            Helpers for pinning, unpinning, resolving.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from functools import total_ordering
from typing import Any, Dict, List, Optional, Sequence, Tuple


# ---------------------------------------------------------------------------
# Version parsing
# ---------------------------------------------------------------------------

_SEMVER_RE = re.compile(
    r"^v?(?P<major>\d+)\.(?P<minor>\d+)(?:\.(?P<patch>\d+))?(?:-(?P<pre>[^\+]+))?$"
)
_COMMIT_RE = re.compile(r"^[0-9a-f]{7,40}$", re.IGNORECASE)


@total_ordering
@dataclass
class Version:
    """A parsed, comparable skill version.

    Attributes
    ----------
    raw:
        The original version string as provided by the source.
    kind:
        ``"semver"``, ``"commit"``, or ``"label"``.
    major / minor / patch:
        Integer components (only meaningful for ``kind == "semver"``).
    pre:
        Pre-release label, e.g. ``"alpha.1"`` (may be empty).
    commit:
        Normalised lowercase hex commit hash (only for ``kind == "commit"``).
    label:
        Original string for ``kind == "label"``.
    """

    raw: str
    kind: str  # "semver" | "commit" | "label"
    major: int = 0
    minor: int = 0
    patch: int = 0
    pre: str = ""
    commit: str = ""
    label: str = ""

    # ------------------------------------------------------------------
    # Comparison
    # ------------------------------------------------------------------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        if self.kind != other.kind:
            return False
        if self.kind == "semver":
            return (self.major, self.minor, self.patch, self.pre) == (
                other.major, other.minor, other.patch, other.pre
            )
        if self.kind == "commit":
            return self.commit == other.commit
        return self.label == other.label

    def __lt__(self, other: "Version") -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        # semver > commit > label
        _rank = {"semver": 2, "commit": 1, "label": 0}
        if self.kind != other.kind:
            return _rank[self.kind] < _rank[other.kind]
        if self.kind == "semver":
            # Pre-release versions are older than the release
            self_tuple = (self.major, self.minor, self.patch)
            other_tuple = (other.major, other.minor, other.patch)
            if self_tuple != other_tuple:
                return self_tuple < other_tuple
            # Both equal tuple: no pre < has pre (release > pre-release)
            if not self.pre and other.pre:
                return False  # self is the release, other is pre-release → self is newer
            if self.pre and not other.pre:
                return True
            return self.pre < other.pre
        if self.kind == "commit":
            # Commits are not inherently ordered; sort lexicographically
            return self.commit < other.commit
        return self.label < other.label

    def __hash__(self) -> int:
        if self.kind == "semver":
            return hash(("semver", self.major, self.minor, self.patch, self.pre))
        if self.kind == "commit":
            return hash(("commit", self.commit))
        return hash(("label", self.label))

    def __repr__(self) -> str:  # pragma: no cover
        return f"Version({self.raw!r})"

    def __str__(self) -> str:
        return self.raw

    @property
    def is_semver(self) -> bool:
        return self.kind == "semver"

    @property
    def is_commit(self) -> bool:
        return self.kind == "commit"

    def semver_tuple(self) -> Tuple[int, int, int]:
        """Return ``(major, minor, patch)`` — only valid for semver versions."""
        return (self.major, self.minor, self.patch)


def parse_version(version_str: str) -> Version:
    """Parse *version_str* into a :class:`Version`.

    Examples
    --------
    >>> parse_version("1.2.3")
    Version('1.2.3')
    >>> parse_version("v2.0.0-beta.1")
    Version('v2.0.0-beta.1')
    >>> parse_version("a1b2c3d")
    Version('a1b2c3d')
    """
    if not isinstance(version_str, str):
        version_str = str(version_str)

    raw = version_str.strip()

    m = _SEMVER_RE.match(raw)
    if m:
        return Version(
            raw=raw,
            kind="semver",
            major=int(m.group("major")),
            minor=int(m.group("minor")),
            patch=int(m.group("patch") or 0),
            pre=m.group("pre") or "",
        )

    if _COMMIT_RE.match(raw):
        return Version(
            raw=raw,
            kind="commit",
            commit=raw.lower(),
        )

    return Version(raw=raw, kind="label", label=raw)


# ---------------------------------------------------------------------------
# VersionPin — stored in lock.json
# ---------------------------------------------------------------------------

@dataclass
class VersionPin:
    """A version constraint for an installed skill.

    Attributes
    ----------
    pinned_version:
        The exact version string that was pinned.  ``None`` means "always
        update to latest".
    installed_version:
        The actual version that is currently installed.
    history:
        List of previously installed version strings (most recent last).
    """

    pinned_version: Optional[str] = None
    installed_version: Optional[str] = None
    history: List[str] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pinned_version": self.pinned_version,
            "installed_version": self.installed_version,
            "history": self.history,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VersionPin":
        return cls(
            pinned_version=data.get("pinned_version"),
            installed_version=data.get("installed_version"),
            history=data.get("history", []),
        )


# ---------------------------------------------------------------------------
# VersionManager — high-level helpers
# ---------------------------------------------------------------------------

class VersionManager:
    """Utility class for version resolution, pinning, and rollback logic.

    All methods are pure (stateless); they take version data as arguments and
    return decisions.  State is managed by the caller (e.g.
    :class:`~tools.skills_hub.HubLockFile`).
    """

    # ------------------------------------------------------------------
    # Resolution
    # ------------------------------------------------------------------

    @staticmethod
    def resolve_best(
        available: Sequence[str],
        pinned: Optional[str] = None,
        allow_prerelease: bool = False,
    ) -> Optional[str]:
        """Return the best matching version from *available*.

        If *pinned* is set and exists in *available*, it is returned as-is.
        Otherwise the latest stable release is returned.

        Parameters
        ----------
        available:
            Sequence of version strings from the remote registry.
        pinned:
            A pinned version constraint.  Exact match only.
        allow_prerelease:
            If ``False`` (default), pre-release versions are excluded unless
            they are explicitly pinned.

        Returns
        -------
        str or None
            The best version string, or ``None`` if *available* is empty.
        """
        if not available:
            return None

        if pinned:
            if pinned in available:
                return pinned
            # Try normalised match
            pinned_v = parse_version(pinned)
            for v_str in available:
                if parse_version(v_str) == pinned_v:
                    return v_str

        parsed = [(parse_version(v), v) for v in available]

        if not allow_prerelease:
            stable = [(pv, v) for pv, v in parsed if not pv.pre]
            if stable:
                parsed = stable

        if not parsed:
            return None

        parsed.sort(key=lambda x: x[0], reverse=True)
        return parsed[0][1]

    @staticmethod
    def needs_update(
        installed: Optional[str],
        latest: Optional[str],
    ) -> bool:
        """Return ``True`` if *installed* is older than *latest*.

        Returns ``False`` if either version is ``None`` or if they are equal.
        """
        if not installed or not latest:
            return False
        iv = parse_version(installed)
        lv = parse_version(latest)
        return iv < lv

    @staticmethod
    def record_upgrade(pin: VersionPin, new_version: str) -> VersionPin:
        """Return a new :class:`VersionPin` recording an upgrade.

        The old installed version is appended to history.
        """
        history = list(pin.history)
        if pin.installed_version:
            history.append(pin.installed_version)
        # Keep at most 10 history entries
        if len(history) > 10:
            history = history[-10:]
        return VersionPin(
            pinned_version=pin.pinned_version,
            installed_version=new_version,
            history=history,
        )

    @staticmethod
    def previous_version(pin: VersionPin) -> Optional[str]:
        """Return the most recently recorded previous version, or ``None``."""
        if pin.history:
            return pin.history[-1]
        return None

    @staticmethod
    def rollback_pin(pin: VersionPin) -> Optional["VersionPin"]:
        """Return a new pin rolled back to the previous version.

        Returns ``None`` if there is no rollback target.
        """
        if not pin.history:
            return None
        history = list(pin.history)
        rollback_to = history.pop()
        return VersionPin(
            pinned_version=rollback_to,
            installed_version=rollback_to,
            history=history,
        )
