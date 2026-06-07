import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  'https://blggkblroafsivifzjow.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsZ2drYmxyb2Fmc2l2aWZ6am93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODE3OTMsImV4cCI6MjA5NjM1Nzc5M30.vWgWRiJFGQqnIdlh7s32fENhVXcVwhkOJ1VpePo3nBs'
);
