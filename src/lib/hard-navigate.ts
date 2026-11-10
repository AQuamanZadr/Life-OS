// Переход с полной перезагрузкой страницы. Нужен при входе и выходе:
// сервер должен заново проверить cookie сессии, а кэш страниц в браузере — сброситься.
export function hardNavigate(path: string) {
  window.location.assign(path);
}
