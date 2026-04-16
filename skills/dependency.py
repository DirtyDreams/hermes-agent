"""Skill Dependency Management for Hermes Skills.

Provides a lightweight dependency model so skills can declare what they
require (other skills, Python packages, CLI tools) and have those
requirements automatically resolved and installed.

Dependency Declaration (in SKILL.md front-matter)
--------------------------------------------------
.. code-block:: yaml

    ---
    name: my-skill
    description: My skill
    hermes:
      dependencies:
        skills:
          - openai/skills/web-search       # another Hermes skill
        python:
          - requests>=2.28
          - httpx
        tools:
          - ffmpeg
          - git
    ---

Public API
----------
SkillDependency       Single dependency descriptor.
DependencySet         A set of dependencies for a skill.
DependencyResolver    Checks / installs a DependencySet.
parse_dependencies    Parse a front-matter dict into a DependencySet.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class SkillDependency:
    """A single dependency declared by a skill.

    Attributes
    ----------
    kind:
        ``"skill"``, ``"python"``, or ``"tool"``.
    spec:
        The dependency specifier:
        - For skills: a hub identifier like ``"openai/skills/web-search"``.
        - For Python: a PEP 508 requirement string like ``"requests>=2.28"``.
        - For tools: a CLI binary name like ``"ffmpeg"``.
    optional:
        If ``True``, a missing dependency is a warning rather than an error.
    """

    kind: str
    spec: str
    optional: bool = False

    def __str__(self) -> str:
        return f"{self.kind}:{self.spec}"


@dataclass
class DependencySet:
    """All dependencies declared by a single skill."""

    skill_name: str
    dependencies: List[SkillDependency] = field(default_factory=list)

    @property
    def skills(self) -> List[SkillDependency]:
        return [d for d in self.dependencies if d.kind == "skill"]

    @property
    def python_packages(self) -> List[SkillDependency]:
        return [d for d in self.dependencies if d.kind == "python"]

    @property
    def tools(self) -> List[SkillDependency]:
        return [d for d in self.dependencies if d.kind == "tool"]

    def is_empty(self) -> bool:
        return not self.dependencies


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def parse_dependencies(skill_name: str, metadata: Dict[str, Any]) -> DependencySet:
    """Parse skill metadata into a :class:`DependencySet`.

    Parameters
    ----------
    skill_name:
        The name of the skill (for error messages).
    metadata:
        The ``hermes`` section of the skill front-matter, e.g. ``{"dependencies": {...}}``.
    """
    dep_set = DependencySet(skill_name=skill_name)

    hermes_meta = metadata if metadata else {}
    deps_raw = hermes_meta.get("dependencies", {})
    if not isinstance(deps_raw, dict):
        return dep_set

    for skill_id in _normalise_list(deps_raw.get("skills", [])):
        dep_set.dependencies.append(SkillDependency(kind="skill", spec=skill_id))

    for pkg in _normalise_list(deps_raw.get("python", [])):
        dep_set.dependencies.append(SkillDependency(kind="python", spec=pkg))

    for tool_name in _normalise_list(deps_raw.get("tools", [])):
        dep_set.dependencies.append(SkillDependency(kind="tool", spec=tool_name))

    # Optional deps
    for skill_id in _normalise_list(deps_raw.get("optional_skills", [])):
        dep_set.dependencies.append(SkillDependency(kind="skill", spec=skill_id, optional=True))

    for pkg in _normalise_list(deps_raw.get("optional_python", [])):
        dep_set.dependencies.append(SkillDependency(kind="python", spec=pkg, optional=True))

    return dep_set


def _normalise_list(value: Any) -> List[str]:
    """Coerce *value* to a list of strings."""
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------

@dataclass
class DependencyResult:
    """Result of a dependency check / install operation."""

    dependency: SkillDependency
    satisfied: bool
    installed_now: bool = False
    error: str = ""


class DependencyResolver:
    """Check and optionally install the dependencies of a skill.

    Parameters
    ----------
    auto_install_python:
        If ``True`` (default), missing Python packages are installed via
        ``pip`` automatically.
    auto_install_skills:
        If ``True`` (default), missing skill dependencies are installed via
        the Skills Hub.
    """

    def __init__(
        self,
        auto_install_python: bool = True,
        auto_install_skills: bool = True,
    ) -> None:
        self.auto_install_python = auto_install_python
        self.auto_install_skills = auto_install_skills

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check(self, dep_set: DependencySet) -> List[DependencyResult]:
        """Check all dependencies and return results (no installation)."""
        results = []
        for dep in dep_set.dependencies:
            satisfied, error = self._is_satisfied(dep)
            results.append(DependencyResult(
                dependency=dep,
                satisfied=satisfied,
                error=error,
            ))
        return results

    def resolve(self, dep_set: DependencySet) -> List[DependencyResult]:
        """Check and install missing dependencies.

        Returns a list of :class:`DependencyResult` objects, one per
        dependency.
        """
        results = []
        for dep in dep_set.dependencies:
            satisfied, error = self._is_satisfied(dep)
            installed_now = False
            if not satisfied:
                if dep.optional:
                    logger.info(
                        "Optional dependency %s not satisfied: %s", dep.spec, error
                    )
                    results.append(DependencyResult(
                        dependency=dep, satisfied=False, error=error
                    ))
                    continue
                installed_now, error = self._install(dep)
                satisfied = installed_now
            results.append(DependencyResult(
                dependency=dep,
                satisfied=satisfied,
                installed_now=installed_now,
                error=error,
            ))
        return results

    def has_unsatisfied(self, dep_set: DependencySet) -> bool:
        """Return ``True`` if any mandatory dependency is unsatisfied."""
        for result in self.check(dep_set):
            if not result.satisfied and not result.dependency.optional:
                return True
        return False

    # ------------------------------------------------------------------
    # Checks
    # ------------------------------------------------------------------

    def _is_satisfied(self, dep: SkillDependency) -> Tuple[bool, str]:
        if dep.kind == "tool":
            return self._check_tool(dep.spec)
        if dep.kind == "python":
            return self._check_python(dep.spec)
        if dep.kind == "skill":
            return self._check_skill(dep.spec)
        return False, f"Unknown dependency kind: {dep.kind!r}"

    @staticmethod
    def _check_tool(name: str) -> Tuple[bool, str]:
        tool_bin = name.split()[0]  # e.g. "git --version" → "git"
        if shutil.which(tool_bin):
            return True, ""
        return False, f"CLI tool '{tool_bin}' not found in PATH"

    @staticmethod
    def _check_python(spec: str) -> Tuple[bool, str]:
        """Check if a Python package requirement is satisfied."""
        try:
            # Use importlib.metadata when available (Python 3.8+)
            from importlib.metadata import requires, version, PackageNotFoundError

            # Extract package name from PEP 508 spec (strip extras and version)
            import re
            pkg_name = re.split(r"[>=<!;\[\s]", spec.strip())[0].strip()
            if not pkg_name:
                return False, f"Cannot parse package spec: {spec!r}"

            try:
                version(pkg_name)
                return True, ""
            except PackageNotFoundError:
                return False, f"Python package '{pkg_name}' not installed"
        except Exception as exc:
            return False, str(exc)

    @staticmethod
    def _check_skill(identifier: str) -> Tuple[bool, str]:
        """Check if a skill dependency is installed."""
        try:
            from tools.skills_hub import HubLockFile
            from tools.skills_tool import _find_all_skills

            lock = HubLockFile()
            skill_name = identifier.rsplit("/", 1)[-1]
            if lock.is_hub_installed(skill_name):
                return True, ""
            # Check builtin / local skills
            all_skills = _find_all_skills()
            if any(s.get("name") == skill_name for s in all_skills):
                return True, ""
            return False, f"Skill '{skill_name}' not installed"
        except Exception as exc:
            return False, str(exc)

    # ------------------------------------------------------------------
    # Installation
    # ------------------------------------------------------------------

    def _install(self, dep: SkillDependency) -> Tuple[bool, str]:
        if dep.kind == "python" and self.auto_install_python:
            return self._install_python(dep.spec)
        if dep.kind == "skill" and self.auto_install_skills:
            return self._install_skill(dep.spec)
        if dep.kind == "tool":
            return False, f"Cannot auto-install CLI tool '{dep.spec}'.  Please install it manually."
        return False, f"Auto-install disabled for {dep.kind} dependency"

    @staticmethod
    def _install_python(spec: str) -> Tuple[bool, str]:
        logger.info("Installing Python package: %s", spec)
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--quiet", spec],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                return True, ""
            return False, result.stderr.strip() or f"pip install failed for {spec!r}"
        except Exception as exc:
            return False, str(exc)

    @staticmethod
    def _install_skill(identifier: str) -> Tuple[bool, str]:
        logger.info("Installing skill dependency: %s", identifier)
        try:
            from hermes_cli.skills_hub import do_install
            do_install(identifier, skip_confirm=True, invalidate_cache=False)
            return True, ""
        except Exception as exc:
            return False, str(exc)
