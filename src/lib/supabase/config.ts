export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Режим для автотестов: без входа и облака. В обычной сборке не включать.
export const localOnly = process.env.NEXT_PUBLIC_LOCAL_ONLY === "1";

export const supabaseConfigured = supabaseUrl !== "" && supabaseKey !== "";
