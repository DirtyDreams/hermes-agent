"""Tests for skills/versioning.py — version parsing, comparison, and pinning."""

import pytest


class TestParseVersion:
    def test_semver_basic(self):
        from skills.versioning import parse_version
        v = parse_version("1.2.3")
        assert v.kind == "semver"
        assert v.major == 1
        assert v.minor == 2
        assert v.patch == 3

    def test_semver_with_v_prefix(self):
        from skills.versioning import parse_version
        v = parse_version("v2.0.0")
        assert v.kind == "semver"
        assert v.major == 2

    def test_semver_short_two_part(self):
        from skills.versioning import parse_version
        v = parse_version("1.2")
        assert v.kind == "semver"
        assert v.patch == 0

    def test_semver_pre_release(self):
        from skills.versioning import parse_version
        v = parse_version("1.0.0-beta.1")
        assert v.kind == "semver"
        assert v.pre == "beta.1"

    def test_commit_hash(self):
        from skills.versioning import parse_version
        v = parse_version("a1b2c3d")
        assert v.kind == "commit"
        assert v.commit == "a1b2c3d"

    def test_commit_hash_uppercase_normalised(self):
        from skills.versioning import parse_version
        v = parse_version("A1B2C3D")
        assert v.commit == "a1b2c3d"

    def test_label_fallback(self):
        from skills.versioning import parse_version
        v = parse_version("nightly-build")
        assert v.kind == "label"

    def test_non_string_coerced(self):
        from skills.versioning import parse_version
        v = parse_version(123)
        assert v.raw == "123"


class TestVersionComparison:
    def test_newer_semver_greater(self):
        from skills.versioning import parse_version
        assert parse_version("2.0.0") > parse_version("1.9.9")

    def test_older_semver_less(self):
        from skills.versioning import parse_version
        assert parse_version("1.0.0") < parse_version("1.0.1")

    def test_equal_semver(self):
        from skills.versioning import parse_version
        assert parse_version("1.2.3") == parse_version("v1.2.3")

    def test_release_greater_than_prerelease(self):
        from skills.versioning import parse_version
        assert parse_version("1.0.0") > parse_version("1.0.0-beta.1")

    def test_semver_greater_than_commit(self):
        from skills.versioning import parse_version
        assert parse_version("1.0.0") > parse_version("a1b2c3d")

    def test_commit_greater_than_label(self):
        from skills.versioning import parse_version
        assert parse_version("a1b2c3d") > parse_version("nightly")

    def test_sort_multiple_versions(self):
        from skills.versioning import parse_version
        versions = ["1.0.0", "2.0.0", "0.5.0", "1.5.0"]
        sorted_v = sorted([parse_version(v) for v in versions])
        assert [str(v) for v in sorted_v] == ["0.5.0", "1.0.0", "1.5.0", "2.0.0"]

    def test_version_hashable(self):
        from skills.versioning import parse_version
        s = {parse_version("1.0.0"), parse_version("v1.0.0"), parse_version("2.0.0")}
        assert len(s) == 2


class TestVersionManager:
    def test_resolve_best_returns_latest(self):
        from skills.versioning import VersionManager
        result = VersionManager.resolve_best(["1.0.0", "1.2.0", "0.9.0"])
        assert result == "1.2.0"

    def test_resolve_best_pinned_returns_pinned(self):
        from skills.versioning import VersionManager
        result = VersionManager.resolve_best(["1.0.0", "2.0.0", "3.0.0"], pinned="2.0.0")
        assert result == "2.0.0"

    def test_resolve_best_pinned_not_in_available_returns_latest(self):
        from skills.versioning import VersionManager
        result = VersionManager.resolve_best(["1.0.0", "2.0.0"], pinned="99.0.0")
        assert result == "2.0.0"

    def test_resolve_best_empty_returns_none(self):
        from skills.versioning import VersionManager
        assert VersionManager.resolve_best([]) is None

    def test_resolve_best_excludes_prerelease_by_default(self):
        from skills.versioning import VersionManager
        result = VersionManager.resolve_best(["1.0.0-beta.1", "0.9.0"])
        assert result == "0.9.0"

    def test_resolve_best_includes_prerelease_when_allowed(self):
        from skills.versioning import VersionManager
        result = VersionManager.resolve_best(
            ["1.0.0-beta.1", "0.9.0"], allow_prerelease=True
        )
        assert result == "1.0.0-beta.1"

    def test_needs_update_true(self):
        from skills.versioning import VersionManager
        assert VersionManager.needs_update("1.0.0", "1.1.0") is True

    def test_needs_update_false_when_same(self):
        from skills.versioning import VersionManager
        assert VersionManager.needs_update("1.0.0", "1.0.0") is False

    def test_needs_update_false_when_installed_newer(self):
        from skills.versioning import VersionManager
        assert VersionManager.needs_update("2.0.0", "1.9.0") is False

    def test_needs_update_false_when_none(self):
        from skills.versioning import VersionManager
        assert VersionManager.needs_update(None, "1.0.0") is False
        assert VersionManager.needs_update("1.0.0", None) is False

    def test_record_upgrade_appends_history(self):
        from skills.versioning import VersionManager, VersionPin

        pin = VersionPin(installed_version="1.0.0", history=[])
        new_pin = VersionManager.record_upgrade(pin, "1.1.0")
        assert new_pin.installed_version == "1.1.0"
        assert "1.0.0" in new_pin.history

    def test_record_upgrade_caps_history_at_10(self):
        from skills.versioning import VersionManager, VersionPin

        history = [f"0.{i}.0" for i in range(10)]
        pin = VersionPin(installed_version="0.10.0", history=history)
        new_pin = VersionManager.record_upgrade(pin, "0.11.0")
        assert len(new_pin.history) <= 10

    def test_rollback_pin_returns_previous(self):
        from skills.versioning import VersionManager, VersionPin

        pin = VersionPin(installed_version="1.1.0", history=["1.0.0"])
        rolled_back = VersionManager.rollback_pin(pin)
        assert rolled_back is not None
        assert rolled_back.installed_version == "1.0.0"
        assert rolled_back.pinned_version == "1.0.0"
        assert rolled_back.history == []

    def test_rollback_pin_returns_none_when_no_history(self):
        from skills.versioning import VersionManager, VersionPin

        pin = VersionPin(installed_version="1.0.0", history=[])
        assert VersionManager.rollback_pin(pin) is None

    def test_version_pin_serialisation(self):
        from skills.versioning import VersionPin

        pin = VersionPin(pinned_version="1.0.0", installed_version="1.1.0", history=["0.9.0"])
        d = pin.to_dict()
        restored = VersionPin.from_dict(d)
        assert restored.pinned_version == "1.0.0"
        assert restored.installed_version == "1.1.0"
        assert restored.history == ["0.9.0"]


class TestHubLockFileVersioning:
    """Tests for version-related additions to HubLockFile."""

    def test_record_install_stores_version(self, tmp_path):
        from tools.skills_hub import HubLockFile

        lock = HubLockFile(path=tmp_path / "lock.json")
        lock.record_install(
            name="test-skill",
            source="github",
            identifier="owner/repo/skills/test-skill",
            trust_level="community",
            scan_verdict="ok",
            skill_hash="abc123",
            install_path="test-skill",
            files=["SKILL.md"],
            version="1.2.3",
        )

        entry = lock.get_installed("test-skill")
        assert entry is not None
        assert entry["version"] == "1.2.3"

    def test_pin_version(self, tmp_path):
        from tools.skills_hub import HubLockFile

        lock = HubLockFile(path=tmp_path / "lock.json")
        lock.record_install(
            name="skill-a",
            source="github",
            identifier="x/y/z",
            trust_level="community",
            scan_verdict="ok",
            skill_hash="hash1",
            install_path="skill-a",
            files=[],
        )

        assert lock.pin_version("skill-a", "1.0.0") is True
        assert lock.get_pinned_version("skill-a") == "1.0.0"

    def test_unpin_version(self, tmp_path):
        from tools.skills_hub import HubLockFile

        lock = HubLockFile(path=tmp_path / "lock.json")
        lock.record_install(
            name="skill-b",
            source="github",
            identifier="x/y/z",
            trust_level="community",
            scan_verdict="ok",
            skill_hash="hash1",
            install_path="skill-b",
            files=[],
        )
        lock.pin_version("skill-b", "2.0.0")
        assert lock.unpin_version("skill-b") is True
        assert lock.get_pinned_version("skill-b") is None

    def test_version_history_accumulates_on_update(self, tmp_path):
        from tools.skills_hub import HubLockFile

        lock = HubLockFile(path=tmp_path / "lock.json")
        # First install
        lock.record_install(
            name="skill-c",
            source="github",
            identifier="x/y/z",
            trust_level="community",
            scan_verdict="ok",
            skill_hash="hash1",
            install_path="skill-c",
            files=[],
            version="1.0.0",
        )
        # Simulate update
        lock.record_install(
            name="skill-c",
            source="github",
            identifier="x/y/z",
            trust_level="community",
            scan_verdict="ok",
            skill_hash="hash2",
            install_path="skill-c",
            files=[],
            version="1.1.0",
        )

        history = lock.get_version_history("skill-c")
        assert "1.0.0" in history
        entry = lock.get_installed("skill-c")
        assert entry["version"] == "1.1.0"

    def test_pin_unknown_skill_returns_false(self, tmp_path):
        from tools.skills_hub import HubLockFile
        lock = HubLockFile(path=tmp_path / "lock.json")
        assert lock.pin_version("nonexistent", "1.0.0") is False
