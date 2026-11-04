-- Security Advisor の指摘対応：Supabase が自動で作った public.rls_auto_enable() の実行許可を外す
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
