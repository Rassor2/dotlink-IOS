"""Dot Link backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://link-puzzle-quest.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def device_id():
    return f"TEST_{uuid.uuid4()}"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Difficulties / Levels ----------------
class TestDifficulties:
    def test_list_difficulties(self, api):
        r = api.get(f"{API}/difficulties", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        diffs = data["difficulties"]
        keys = [d["key"] for d in diffs]
        assert set(keys) == {"lumina", "aurora", "zenith", "eclipse", "void"}
        for d in diffs:
            assert 60 <= d["count"] <= 100, f"{d['key']} count={d['count']}"
        # ordering
        orders = [d["order"] for d in diffs]
        assert orders == sorted(orders)

    def test_levels_for_lumina(self, api):
        r = api.get(f"{API}/levels/lumina", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["difficulty"] == "lumina"
        assert data["size"] == 4
        assert 60 <= data["count"] <= 100
        # First level structure
        first = data["levels"][0]
        assert "id" in first and "dots" in first and "size" in first
        assert first["size"] == 4
        assert len(first["dots"]) >= 2
        for dot in first["dots"]:
            assert "color" in dot and "a" in dot and "b" in dot

    def test_level_no_solution(self, api):
        r = api.get(f"{API}/level/lumina/1", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["size"] == 4
        assert "solution" not in data
        assert len(data["dots"]) >= 2

    def test_level_with_solution(self, api):
        r = api.get(f"{API}/level/lumina/1?include_solution=true", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "solution" in data
        assert isinstance(data["solution"], list)
        assert len(data["solution"]) >= 2
        # Each solution entry has color and path
        for s in data["solution"]:
            assert "color" in s and "path" in s
            assert isinstance(s["path"], list)
            assert len(s["path"]) >= 2

    def test_invalid_difficulty(self, api):
        r = api.get(f"{API}/levels/unknown", timeout=10)
        assert r.status_code == 404

    def test_invalid_level_index(self, api):
        r = api.get(f"{API}/level/lumina/9999", timeout=10)
        assert r.status_code == 404


# ---------------- Profile ----------------
class TestProfile:
    def test_init_creates_with_250_coins(self, api, device_id):
        r = api.post(f"{API}/profile/init", json={"device_id": device_id, "name": "TestUser"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["device_id"] == device_id
        assert data["coins"] == 250
        assert data["settings"]["sound"] is True
        # idempotency
        r2 = api.post(f"{API}/profile/init", json={"device_id": device_id, "name": "TestUser"}, timeout=30)
        assert r2.json()["coins"] == 250  # not doubled

    def test_get_profile(self, api, device_id):
        r = api.get(f"{API}/profile/{device_id}", timeout=10)
        assert r.status_code == 200
        assert r.json()["device_id"] == device_id

    def test_sync_merges(self, api, device_id):
        payload = {
            "device_id": device_id,
            "coins": 300,
            "completed": {
                "lumina-1": {"level_id": "lumina-1", "stars": 2, "moves": 12, "time_ms": 5000}
            },
            "settings": {"sound": False},
        }
        r = api.post(f"{API}/profile/sync", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["coins"] == 300  # max(250, 300)
        assert "lumina-1" in data["completed"]
        assert data["completed"]["lumina-1"]["stars"] == 2
        assert data["settings"]["sound"] is False

        # Lower stars should NOT overwrite higher
        payload2 = {**payload, "coins": 100,
                    "completed": {"lumina-1": {"level_id": "lumina-1", "stars": 1, "moves": 8, "time_ms": 3000}}}
        r2 = api.post(f"{API}/profile/sync", json=payload2, timeout=30)
        d2 = r2.json()
        assert d2["coins"] == 300  # max preserved
        assert d2["completed"]["lumina-1"]["stars"] == 2  # best wins
        assert d2["completed"]["lumina-1"]["moves"] == 8  # min moves


# ---------------- Ads ----------------
class TestAds:
    def test_reward_adds_coins(self, api, device_id):
        before = api.get(f"{API}/profile/{device_id}", timeout=10).json()["coins"]
        r = api.post(f"{API}/ads/reward", json={"device_id": device_id, "amount": 50}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["added"] == 50
        assert data["coins"] == before + 50

    def test_reward_invalid_amount(self, api, device_id):
        r = api.post(f"{API}/ads/reward", json={"device_id": device_id, "amount": 7}, timeout=10)
        assert r.status_code == 400


# ---------------- Shop / Stripe ----------------
class TestShop:
    def test_list_packs(self, api):
        r = api.get(f"{API}/shop/packs", timeout=10)
        assert r.status_code == 200
        packs = r.json()["packs"]
        ids = [p["id"] for p in packs]
        assert set(ids) == {"spark", "nova", "galaxy", "cosmos"}
        for p in packs:
            assert p["total"] == p["coins"] + p["bonus"]

    def test_checkout_create_returns_url(self, api, device_id):
        payload = {
            "device_id": device_id,
            "pack_id": "spark",
            "origin_url": BASE_URL,
        }
        r = api.post(f"{API}/checkout/create", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("https://")
        assert "session_id" in data and data["session_id"]
        # Status open
        sid = data["session_id"]
        s = api.get(f"{API}/checkout/status/{sid}", timeout=30)
        assert s.status_code == 200, s.text
        sdata = s.json()
        assert sdata["session_id"] == sid
        assert sdata["status"] in ("open", "complete", "expired")
        assert sdata["payment_status"] in ("unpaid", "paid", "no_payment_required")

    def test_checkout_invalid_pack(self, api, device_id):
        r = api.post(
            f"{API}/checkout/create",
            json={"device_id": device_id, "pack_id": "bogus", "origin_url": BASE_URL},
            timeout=10,
        )
        assert r.status_code == 400

    def test_checkout_status_404(self, api):
        r = api.get(f"{API}/checkout/status/cs_test_doesnotexist", timeout=10)
        assert r.status_code == 404
