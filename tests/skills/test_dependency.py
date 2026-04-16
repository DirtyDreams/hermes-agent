"""Tests for skills/dependency.py — dependency model and resolver."""

import sys
from unittest.mock import MagicMock, patch

import pytest


class TestParseDependencies:
    def test_empty_metadata_returns_empty_set(self):
        from skills.dependency import parse_dependencies
        dep_set = parse_dependencies("my-skill", {})
        assert dep_set.is_empty()

    def test_parses_python_deps(self):
        from skills.dependency import parse_dependencies
        meta = {"dependencies": {"python": ["requests>=2.28", "httpx"]}}
        dep_set = parse_dependencies("my-skill", meta)
        assert len(dep_set.python_packages) == 2
        specs = [d.spec for d in dep_set.python_packages]
        assert "requests>=2.28" in specs

    def test_parses_tool_deps(self):
        from skills.dependency import parse_dependencies
        meta = {"dependencies": {"tools": ["ffmpeg", "git"]}}
        dep_set = parse_dependencies("my-skill", meta)
        assert len(dep_set.tools) == 2

    def test_parses_skill_deps(self):
        from skills.dependency import parse_dependencies
        meta = {"dependencies": {"skills": ["openai/skills/web-search"]}}
        dep_set = parse_dependencies("my-skill", meta)
        assert len(dep_set.skills) == 1
        assert dep_set.skills[0].spec == "openai/skills/web-search"

    def test_parses_optional_python_deps(self):
        from skills.dependency import parse_dependencies
        meta = {"dependencies": {"optional_python": ["numpy"]}}
        dep_set = parse_dependencies("my-skill", meta)
        assert len(dep_set.python_packages) == 1
        assert dep_set.python_packages[0].optional is True

    def test_string_dep_coerced_to_list(self):
        from skills.dependency import parse_dependencies
        meta = {"dependencies": {"python": "requests"}}
        dep_set = parse_dependencies("my-skill", meta)
        assert len(dep_set.python_packages) == 1

    def test_non_dict_dependencies_returns_empty(self):
        from skills.dependency import parse_dependencies
        dep_set = parse_dependencies("my-skill", {"dependencies": "invalid"})
        assert dep_set.is_empty()


class TestDependencyResolver:
    def test_check_tool_found(self):
        from skills.dependency import DependencyResolver

        resolver = DependencyResolver()
        satisfied, error = resolver._check_tool("python")
        # python must be available in the test environment
        assert satisfied is True
        assert error == ""

    def test_check_tool_not_found(self):
        from skills.dependency import DependencyResolver

        resolver = DependencyResolver()
        satisfied, error = resolver._check_tool("definitely_not_a_real_cli_tool_xyz123")
        assert satisfied is False
        assert "not found in PATH" in error

    def test_check_python_installed(self):
        from skills.dependency import DependencyResolver

        resolver = DependencyResolver()
        satisfied, error = resolver._check_python("pytest")
        assert satisfied is True

    def test_check_python_not_installed(self):
        from skills.dependency import DependencyResolver

        resolver = DependencyResolver()
        satisfied, error = resolver._check_python("definitely_not_installed_xyz_abc_123")
        assert satisfied is False
        assert "not installed" in error

    def test_check_returns_result_per_dep(self):
        from skills.dependency import DependencyResolver, DependencySet, SkillDependency

        dep_set = DependencySet(skill_name="test-skill", dependencies=[
            SkillDependency(kind="tool", spec="python"),
            SkillDependency(kind="tool", spec="definitely_not_a_real_tool_xyz"),
        ])
        resolver = DependencyResolver()
        results = resolver.check(dep_set)
        assert len(results) == 2
        satisfied_map = {r.dependency.spec: r.satisfied for r in results}
        assert satisfied_map["python"] is True
        assert satisfied_map["definitely_not_a_real_tool_xyz"] is False

    def test_optional_unsatisfied_dep_doesnt_block(self):
        from skills.dependency import DependencyResolver, DependencySet, SkillDependency

        dep_set = DependencySet(skill_name="test-skill", dependencies=[
            SkillDependency(kind="tool", spec="definitely_not_a_real_tool_xyz", optional=True),
        ])
        resolver = DependencyResolver(auto_install_python=False, auto_install_skills=False)
        results = resolver.resolve(dep_set)
        assert len(results) == 1
        assert results[0].satisfied is False
        assert not resolver.has_unsatisfied(dep_set)

    def test_has_unsatisfied_mandatory_dep(self):
        from skills.dependency import DependencyResolver, DependencySet, SkillDependency

        dep_set = DependencySet(skill_name="test-skill", dependencies=[
            SkillDependency(kind="tool", spec="definitely_not_a_real_tool_xyz"),
        ])
        resolver = DependencyResolver(auto_install_python=False, auto_install_skills=False)
        assert resolver.has_unsatisfied(dep_set) is True

    def test_install_python_package_via_pip(self, monkeypatch):
        from skills.dependency import DependencyResolver

        mock_run = MagicMock()
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        monkeypatch.setattr("subprocess.run", mock_run)

        success, error = DependencyResolver._install_python("requests")
        assert success is True
        assert error == ""
        mock_run.assert_called_once()

    def test_install_python_failure_returns_error(self, monkeypatch):
        from skills.dependency import DependencyResolver

        mock_run = MagicMock()
        mock_run.return_value = MagicMock(returncode=1, stderr="No matching distribution")
        monkeypatch.setattr("subprocess.run", mock_run)

        success, error = DependencyResolver._install_python("not-a-package")
        assert success is False
        assert "No matching distribution" in error

    def test_skill_dependency_str(self):
        from skills.dependency import SkillDependency
        dep = SkillDependency(kind="python", spec="requests>=2.28")
        assert str(dep) == "python:requests>=2.28"
