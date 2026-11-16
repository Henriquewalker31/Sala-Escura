from __future__ import annotations

import time
from typing import Any, Awaitable, Callable


class TTLCache:
    def __init__(self, ttl: float = 600.0, maxsize: int = 500) -> None:
        self._ttl = ttl
        self._maxsize = maxsize
        self._data: dict[str, tuple[float, Any]] = {}

    async def get_or_set(
        self,
        key: str,
        loader: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, bool]:
        """Devolve (valor, veio_do_cache).

        Não usamos lock: entre a leitura e a escrita não existe nenhum
        ponto de suspensão, e um único event loop atende o dicionário.
        """
        entry = self._data.get(key)
        if entry is not None and entry[0] > time.monotonic():
            return entry[1], True

        value = await loader()

        if len(self._data) >= self._maxsize:
            self._data.clear()  # simples e suficiente em escala de demo
        self._data[key] = (time.monotonic() + self._ttl, value)
        return value, False

    def clear(self) -> None:
        self._data.clear()

    @property
    def size(self) -> int:
        return len(self._data)
