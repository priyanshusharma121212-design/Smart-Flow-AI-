import logging
import pytest
import httpx
from uuid import uuid4
from starlette.websockets import WebSocketDisconnect

from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.services.here_traffic_service import here_traffic_service

client = TestClient(app)


def test_health_uses_consistent_envelope() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["status"] == "ok"
    assert payload["timestamp"]


def test_dashboard_does_not_invent_live_metrics() -> None:
    response = client.get("/api/dashboard/summary")
    data = response.json()["data"]

    assert response.status_code == 200
    assert data["available"] is False
    assert data["active_runs"] is None
    assert data["intersection_count"] is None


def test_simulation_start_returns_accepted_when_service_starts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.schemas.simulation import SimulationState

    async def fake_start(request):
        assert request.scenario == "normal"
        assert request.controller_mode == "fixed_time"
        return SimulationState(
            available=True,
            status="running",
            run_id="test-run",
            scenario="normal",
            controller_mode="fixed_time",
            reason="Mock simulation started.",
        )

    monkeypatch.setattr(
        "app.services.simulation_service.simulation_service.start",
        fake_start,
    )

    response = client.post("/api/simulation/start", json={"scenario": "normal"})

    assert response.status_code == 202
    assert response.json()["success"] is True
    assert response.json()["data"]["status"] == "running"

def test_simulation_start_accepts_omitted_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.schemas.simulation import SimulationState

    async def fake_start(request):
        assert request.scenario == "normal"
        assert request.controller_mode == "fixed_time"
        return SimulationState(
            available=True,
            status="running",
            run_id="test-default-run",
            scenario="normal",
            controller_mode="fixed_time",
            reason="Mock simulation started with defaults.",
        )

    monkeypatch.setattr(
        "app.services.simulation_service.simulation_service.start",
        fake_start,
    )

    response = client.post("/api/simulation/start")

    assert response.status_code == 202
    assert response.json()["success"] is True
    assert response.json()["data"]["scenario"] == "normal"

def test_simulation_request_rejects_unknown_fields() -> None:
    response = client.post("/api/simulation/start", json={"scenario": "normal", "extra": True})

    assert response.status_code == 422
    assert response.json()["success"] is False


def test_emergency_requests_are_not_reported_as_detected_or_applied() -> None:
    response = client.post(
        "/api/traffic/emergency",
        json={
            "vehicle_type": "ambulance",
            "intersection_id": "intersection-1",
            "direction": "north",
            "priority": 2,
        },
    )

    assert response.status_code == 201
    event = response.json()["data"]
    assert event["status"] == "submitted"
    assert event["priority_applied"] is False
    assert "no vehicle detection" in response.json()["message"]


@pytest.mark.parametrize("origin", [
    "http://127.0.0.1:5174",
    "http://localhost:5176",
    "https://smart-flow-ai-beta.vercel.app",
])
def test_cors_allows_frontend_origins(origin: str) -> None:
    response = client.options(
        "/api/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_websocket_reports_inactive_state_without_fake_updates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.schemas.simulation import SimulationState

    inactive_state = SimulationState(
        available=False,
        status="inactive",
        run_id=None,
        scenario=None,
        controller_mode=None,
        reason="No active simulation.",
    )

    monkeypatch.setattr(
        "app.services.simulation_service.simulation_service.get_status",
        lambda: inactive_state,
    )

    run_id = str(uuid4())

    with client.websocket_connect(f"/ws/simulation/{run_id}") as websocket:
        message = websocket.receive_json()

    assert message["event"] == "simulation.status"
    assert message["data"]["available"] is False
    assert message["data"]["status"] == "inactive"

def test_websocket_rejects_malformed_run_id() -> None:
    with pytest.raises(WebSocketDisconnect) as error:
        with client.websocket_connect("/ws/simulation/not-a-uuid"):
            pass

    assert error.value.code == 1008
    assert error.value.reason == "Invalid simulation run ID."


def mock_here_http(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def make_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", make_client)
    monkeypatch.setattr("app.services.here_traffic_service.asyncio.sleep", noop_sleep)


async def noop_sleep(_seconds: float) -> None:
    return None


def test_here_missing_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "")
    here_traffic_service.status = "NOT_CONFIGURED"

    response = client.get("/api/integrations/here/status")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "NOT_CONFIGURED"

    response = client.get("/api/integrations/here/flow")
    assert response.status_code == 503
    assert response.json()["success"] is False


def test_here_successful_flow_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["apiKey"] == "test-key"
        assert "circle:26.9124,75.7873;r=5000" in request.url.params["in"]
        assert request.url.params["locationReferencing"] == "shape"
        return httpx.Response(
            200,
            json={
                "sourceUpdated": "2026-11-19T17:00:00Z",
                "results": [{
                    "id": "segment-1",
                    "location": {"reference": {"id": "road-1"}, "shape": [[75.7873, 26.9124]]},
                    "currentFlow": {
                        "speed": 10,
                        "freeFlow": 20,
                        "jamFactor": 4.2,
                        "confidence": 0.95,
                        "traversability": "open",
                    },
                }],
            },
        )

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/flow")

    assert response.status_code == 200
    item = response.json()["data"]["items"][0]
    assert item["speed_mps"] == 10
    assert item["speed_kph"] == 36.0
    assert item["free_flow_speed_mps"] == 20
    assert item["free_flow_speed_kph"] == 72.0
    assert item["jam_factor"] == 4.2


def test_here_invalid_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "invalid-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "Unauthorized"})

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/health")

    assert response.status_code == 502
    assert "credentials" in response.json()["message"].lower()


def test_here_api_key_is_not_exposed_in_logs_or_api_responses(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    secret = "test-key-not-for-logs"
    monkeypatch.setattr(settings, "here_api_key", secret)
    caplog.set_level(logging.INFO, logger="httpx")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "Unauthorized"})

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/flow")

    assert response.status_code == 502
    assert secret not in caplog.text
    assert secret not in response.text


def test_here_provider_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out")

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/flow")

    assert response.status_code == 504
    assert "timed out" in response.json()["message"].lower()


def test_here_rate_limiting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "rate limit"})

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/incidents")

    assert response.status_code == 429
    assert "rate limit" in response.json()["message"].lower()


def test_here_empty_traffic_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": []})

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/flow")

    assert response.status_code == 200
    assert response.json()["data"]["available"] is False
    assert response.json()["data"]["items"] == []


def test_here_invalid_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json", headers={"content-type": "text/plain"})

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/flow")

    assert response.status_code == 502
    assert "invalid json" in response.json()["message"].lower()


def test_here_incident_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "incidents": [{
                    "id": "incident-1",
                    "type": "accident",
                    "summary": "Vehicle accident",
                    "startTime": "2026-11-19T17:00:00Z",
                    "location": {"reference": {"id": "road-1"}},
                }]
            },
        )

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/incidents")

    assert response.status_code == 200
    assert response.json()["data"]["available"] is True
    assert response.json()["data"]["items"][0]["incident_type"] == "accident"


def test_here_health_distinguishes_backend_and_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": []})

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/integrations/here/health")

    assert response.status_code == 200
    assert response.json()["data"]["backend_status"] == "ok"
    assert response.json()["data"]["provider_status"] == "CONNECTED"
    assert response.json()["data"]["flow_available"] is False


def test_here_router_registered_exactly_once() -> None:
    openapi = app.openapi()
    matching = [
        path
        for path in openapi["paths"]
        if path.startswith("/api/integrations/here/")
    ]
    assert len(matching) == 4


def test_live_traffic_returns_provider_observations_without_invented_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "here_api_key", "test-key")
    monkeypatch.setattr(settings, "database_url", "")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/flow"):
            return httpx.Response(
                200,
                json={
                    "sourceUpdated": "2026-11-20T05:00:00Z",
                    "results": [{
                        "location": {
                            "reference": {"id": "road-1"},
                            "shape": {"links": [{"points": [{"lat": 26.9, "lng": 75.7}]}]},
                        },
                        "currentFlow": {
                            "speed": 10,
                            "freeFlow": 20,
                            "jamFactor": 6,
                            "confidence": 0.9,
                            "traversability": "open",
                        },
                    }],
                },
            )
        return httpx.Response(
            200,
            json={"results": [{"incident": {"id": "incident-1", "type": "accident"}}]},
        )

    mock_here_http(monkeypatch, handler)
    response = client.get("/api/traffic/live")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["available"] is True
    assert data["flow_items"][0]["speed_mps"] == 10
    assert data["incidents"][0]["id"] == "incident-1"
    assert data["persistence_status"] == "NOT_CONFIGURED"
    assert "vehicle_count" not in data
    assert "queue_length" not in data


def test_intersections_returns_empty_without_configured_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "database_url", "")

    response = client.get("/api/traffic/intersections")

    assert response.status_code == 200
    assert response.json()["data"]["available"] is False
    assert response.json()["data"]["items"] == []


def test_traffic_router_registration_contains_required_routes() -> None:
    traffic_paths = {
        path
        for path in app.openapi()["paths"]
        if path.startswith("/api/traffic/")
    }

    assert "/api/traffic/live" in traffic_paths
    assert "/api/traffic/intersections" in traffic_paths


def test_database_router_registration_contains_six_read_routes() -> None:
    database_paths = {
        path
        for path in app.openapi()["paths"]
        if path.startswith("/api/database/")
    }

    assert database_paths == {
        "/api/database/health",
        "/api/database/junctions",
        "/api/database/observations",
        "/api/database/traffic-observations",
        "/api/database/signal-config",
        "/api/database/vehicle-types",
        "/api/database/scenarios",
        "/api/database/traffic-scenarios",
        "/api/database/scenario-approaches",
    }
