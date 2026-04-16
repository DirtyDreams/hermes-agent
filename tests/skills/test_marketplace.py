"""Tests for skills/marketplace.py — analytics and client."""

import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestSkillRating:
    def test_to_and_from_dict_roundtrip(self):
        from skills.marketplace import SkillRating
        r = SkillRating(
            skill_name="my-skill",
            stars=4.5,
            rating_count=10,
            installs=200,
            weekly_installs=5,
            featured=True,
        )
        restored = SkillRating.from_dict(r.to_dict())
        assert restored.skill_name == "my-skill"
        assert restored.stars == 4.5
        assert restored.rating_count == 10
        assert restored.featured is True

    def test_from_dict_with_missing_fields_uses_defaults(self):
        from skills.marketplace import SkillRating
        r = SkillRating.from_dict({"skill_name": "foo"})
        assert r.stars == 0.0
        assert r.installs == 0
        assert r.featured is False


class TestSkillAnalytics:
    def test_record_and_get_invocation_count(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        analytics.record_invocation("skill-a")
        analytics.record_invocation("skill-a")
        analytics.record_invocation("skill-b")
        assert analytics.get_invocation_count("skill-a") == 2
        assert analytics.get_invocation_count("skill-b") == 1
        assert analytics.get_invocation_count("skill-c") == 0

    def test_top_skills_sorted_by_count(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        for _ in range(5):
            analytics.record_invocation("skill-a")
        for _ in range(3):
            analytics.record_invocation("skill-b")
        analytics.record_invocation("skill-c")

        top = analytics.top_skills(2)
        assert top[0]["name"] == "skill-a"
        assert top[0]["invocations"] == 5
        assert len(top) == 2

    def test_record_and_get_rating(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        analytics.record_rating("skill-x", 4.0)
        assert analytics.get_local_rating("skill-x") == 4.0

    def test_rating_clamped_to_valid_range(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        analytics.record_rating("skill-y", 99.0)
        assert analytics.get_local_rating("skill-y") == 5.0
        analytics.record_rating("skill-z", -1.0)
        assert analytics.get_local_rating("skill-z") == 0.0

    def test_summary(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        analytics.record_invocation("s1")
        analytics.record_invocation("s1")
        analytics.record_invocation("s2")
        analytics.record_rating("s1", 5.0)

        summary = analytics.summary()
        assert summary["total_skills_used"] == 2
        assert summary["total_invocations"] == 3
        assert summary["total_rated"] == 1

    def test_get_invocation_count_for_unknown_skill(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        assert analytics.get_invocation_count("never-used") == 0

    def test_get_local_rating_for_unrated_skill(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        analytics = SkillAnalytics(analytics_path=tmp_path / "analytics.json")
        assert analytics.get_local_rating("never-rated") is None

    def test_persists_between_instances(self, tmp_path):
        from skills.marketplace import SkillAnalytics
        path = tmp_path / "analytics.json"
        a1 = SkillAnalytics(analytics_path=path)
        a1.record_invocation("skill-persistent")

        a2 = SkillAnalytics(analytics_path=path)
        assert a2.get_invocation_count("skill-persistent") == 1


class TestMarketplaceClient:
    def test_is_configured_returns_false_without_url(self, monkeypatch):
        from skills.marketplace import MarketplaceClient
        monkeypatch.delenv("HERMES_MARKETPLACE_URL", raising=False)
        client = MarketplaceClient(base_url="")
        assert client.is_configured() is False

    def test_is_configured_returns_true_with_url(self):
        from skills.marketplace import MarketplaceClient
        client = MarketplaceClient(base_url="https://marketplace.example.com")
        assert client.is_configured() is True

    def test_get_ratings_returns_empty_when_not_configured(self):
        from skills.marketplace import MarketplaceClient
        client = MarketplaceClient(base_url="")
        result = client.get_ratings(["skill-a", "skill-b"])
        assert result == {}

    def test_get_featured_returns_empty_when_not_configured(self):
        from skills.marketplace import MarketplaceClient
        client = MarketplaceClient(base_url="")
        result = client.get_featured()
        assert result == []

    def test_submit_rating_returns_false_when_not_configured(self):
        from skills.marketplace import MarketplaceClient
        client = MarketplaceClient(base_url="")
        result = client.submit_rating("skill-a", 4.0)
        assert result is False

    def test_get_featured_uses_cache(self, tmp_path):
        from skills.marketplace import MarketplaceClient, SkillRating

        client = MarketplaceClient(
            base_url="https://marketplace.example.com",
            cache_dir=tmp_path / "cache",
        )
        # Pre-populate cache
        cache_key = "featured_10"
        client._write_cache(cache_key, [
            {"skill_name": "cached-skill", "stars": 4.0, "rating_count": 5,
             "installs": 100, "weekly_installs": 10, "featured": True}
        ])
        results = client.get_featured(limit=10)
        assert len(results) == 1
        assert results[0].skill_name == "cached-skill"

    def test_cache_expired_triggers_network_call(self, tmp_path):
        from skills.marketplace import MarketplaceClient

        client = MarketplaceClient(
            base_url="https://marketplace.example.com",
            cache_dir=tmp_path / "cache",
            cache_ttl=0,  # Immediately expired
        )
        # Write a stale cache entry
        cache_key = "featured_10"
        client._write_cache(cache_key, [{"skill_name": "stale"}])

        # Make the cache file appear old
        cache_path = client.cache_dir / f"{cache_key}.json"
        old_time = time.time() - 10
        import os
        os.utime(str(cache_path), (old_time, old_time))

        # Network call should fail gracefully, returning empty
        results = client.get_featured(limit=10)
        assert results == []  # Network unavailable → graceful empty
