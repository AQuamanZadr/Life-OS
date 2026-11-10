"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Дата берётся в браузере, чтобы учитывать часовой пояс пользователя.
export function TodayDate() {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    () => "",
  );
  return <span className="first-letter:uppercase inline-block">{text || " "}</span>;
}
