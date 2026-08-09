import logging
import asyncio
from typing import Dict, Any


async def send_push_notification(
    user_id: str, title: str, body: str, data: Dict[str, Any] = None
) -> bool:
    """
    Mock Push Notification Service.
    In a real environment, this would integrate with Firebase Cloud Messaging (FCM) or Apple Push Notification Service (APNS).

    Args:
        user_id: The ID of the guardian/user to notify.
        title: Notification title.
        body: Notification body.
        data: Optional metadata payload.

    Returns:
        True if simulated push succeeded.
    """
    try:
        # Simulate network latency (requirement: < 2 sec latency)
        await asyncio.sleep(0.5)

        logging.info(
            f"📲 [PUSH NOTIFICATION SENT] User: {user_id} | Title: '{title}' | Body: '{body}' | Data: {data}"
        )
        return True
    except Exception as e:
        logging.error(
            f"Failed to send push notification to {user_id}: {str(e)}", exc_info=True
        )
        return False
