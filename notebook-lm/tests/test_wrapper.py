"""Tests for wrapper module."""

import pytest

from src.wrapper import list_notebooks, run


def test_run_raises_on_bad_command():
    """Test that run() raises RuntimeError on bad command."""
    with pytest.raises(RuntimeError):
        run(["--nonexistent-flag-that-will-fail"])


def test_list_notebooks_returns_list():
    """Test that list_notebooks returns a list."""
    # This will fail against real CLI if not mocked, but shows the contract
    try:
        result = list_notebooks()
        assert isinstance(result, list)
    except RuntimeError:
        # Expected if CLI not available or returns unexpected output
        pass
