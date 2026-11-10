import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  localOnly,
  supabaseConfigured,
  supabaseKey,
  supabaseUrl,
} from "@/lib/supabase/config";

// Закрывает все страницы для неавторизованных и обновляет сессию.
export async function proxy(request: NextRequest) {
  if (localOnly) return NextResponse.next();

  const isLogin = request.nextUrl.pathname === "/login";
  // Без настроек Supabase доступ закрыт: показываем только страницу входа.
  if (!supabaseConfigured) {
    return isLogin ? NextResponse.next() : redirect(request, "/login");
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {}))
          response.headers.set(key, value);
      },
    },
  });

  // getClaims проверяет подпись токена, а не доверяет содержимому cookie.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !isLogin) return redirect(request, "/login", response);
  if (signedIn && isLogin) return redirect(request, "/", response);
  return response;
}

function redirect(request: NextRequest, path: string, from?: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const result = NextResponse.redirect(url);
  // Переносим обновлённые cookie сессии, иначе они потеряются при редиректе.
  for (const cookie of from?.cookies.getAll() ?? []) result.cookies.set(cookie);
  return result;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico|webp)$).*)",
  ],
};
