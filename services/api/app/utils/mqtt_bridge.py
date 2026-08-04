"""
Module 10: Future IoT Integration — MQTT bridge adapter.

Allows edge nodes (ESP32, Raspberry Pi) to publish vitals over MQTT instead of
HTTP. The adapter is intentionally dependency-light:

- If `aiomqtt` (or `paho.mqtt`) is installed, it can connect to a real broker.
- If not (or the broker is unreachable), it falls back to the existing HTTP
  ingestion path so the pipeline never crashes — the same graceful-degradation
  pattern used across PRISM.

The broker URL and topic are configured via settings:
    MQTT_BROKER_URL (default mqtt://localhost:1883)
    MQTT_TOPIC_PREFIX (default "prism/vitals")
"""
import asyncio
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# Cache the client factory so we only attempt broker discovery once.
_broker_available: bool | None = None


def mqtt_available() -> bool:
    """True if an MQTT client library is importable (real broker path)."""
    global _broker_available
    if _broker_available is not None:
        return _broker_available
    try:
        import aiomqtt  # noqa: F401
        _broker_available = True
    except ImportError:
        try:
            import paho.mqtt.client  # noqa: F401
            _broker_available = True
        except ImportError:
            logger.warning(
                "No MQTT client installed (aiomqtt/paho). Vitals will fall back "
                "to the HTTP ingestion path."
            )
            _broker_available = False
    return _broker_available


async def publish_vitals_mqtt(device_id: str, vitals: dict) -> bool:
    """
    Publishes a vitals sample to the MQTT broker. Returns True if published,
    False if the broker path is unavailable (caller should fall back to HTTP).
    """
    if not mqtt_available():
        return False

    topic = f"{settings.MQTT_TOPIC_PREFIX}/{device_id}"
    payload = json.dumps({"device_id": device_id, **vitals})

    try:
        import aiomqtt

        async with aiomqtt.Client(settings.MQTT_BROKER_URL) as client:
            await client.publish(topic, payload=payload, qos=1)
        logger.info("Published vitals to MQTT topic %s", topic)
        return True
    except Exception as e:
        logger.warning("MQTT publish failed (%s); falling back to HTTP", str(e))
        return False


def publish_vitals_mqtt_sync(device_id: str, vitals: dict) -> bool:
    """Synchronous wrapper for non-async call sites."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import asyncio as _a

            future = asyncio.run_coroutine_threadsafe(
                publish_vitals_mqtt(device_id, vitals), loop
            )
            return future.result(timeout=5)
        return loop.run_until_complete(publish_vitals_mqtt(device_id, vitals))
    except Exception as e:
        logger.warning("Sync MQTT publish failed: %s", str(e))
        return False
