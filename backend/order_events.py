import asyncio
import threading
from dataclasses import dataclass


@dataclass(eq=False)
class OrderEventSubscription:
    order_id: str
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[dict[str, str]]


class OrderEventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[OrderEventSubscription]] = {}
        self._lock = threading.Lock()

    def subscribe(self, order_id: str) -> OrderEventSubscription:
        subscription = OrderEventSubscription(
            order_id=order_id,
            loop=asyncio.get_running_loop(),
            queue=asyncio.Queue(maxsize=16),
        )
        with self._lock:
            self._subscribers.setdefault(order_id, set()).add(subscription)
        return subscription

    def unsubscribe(self, subscription: OrderEventSubscription) -> None:
        with self._lock:
            subscribers = self._subscribers.get(subscription.order_id)
            if subscribers is None:
                return
            subscribers.discard(subscription)
            if not subscribers:
                self._subscribers.pop(subscription.order_id, None)

    def publish(self, order_id: str, status: str) -> None:
        event = {"order_id": order_id, "status": status}
        with self._lock:
            subscribers = tuple(self._subscribers.get(order_id, ()))

        for subscription in subscribers:
            try:
                subscription.loop.call_soon_threadsafe(
                    self._enqueue,
                    subscription.queue,
                    event,
                )
            except RuntimeError:
                self.unsubscribe(subscription)

    @staticmethod
    def _enqueue(
        queue: asyncio.Queue[dict[str, str]],
        event: dict[str, str],
    ) -> None:
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        queue.put_nowait(event)


order_event_broker = OrderEventBroker()
