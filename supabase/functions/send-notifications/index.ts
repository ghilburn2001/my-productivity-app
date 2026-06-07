import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIREBASE_SERVER_KEY = Deno.env.get('FIREBASE_SERVER_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Get all calendar events with reminders
  const { data: events } = await supabase
    .from('cals')
    .select('*')
    .gt('reminder', 0)

  // Get all FCM tokens
  const { data: tokens } = await supabase
    .from('fcm_tokens')
    .select('token')

  if (!events || !tokens) return new Response('No data', { status: 200 })

  const now = new Date()

  for (const event of events) {
    const eventTime = new Date(`${event.date}T${event.time}`)
    const reminderTime = new Date(eventTime.getTime() - event.reminder * 60 * 1000)
    const diff = Math.abs(reminderTime.getTime() - now.getTime())

    // Fire if within 1 minute of reminder time
    if (diff < 60000) {
      for (const { token } of tokens) {
        await fetch(`https://fcm.googleapis.com/fcm/send`, {
          method: 'POST',
          headers: {
            'Authorization': `key=${FIREBASE_SERVER_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title: `📅 ${event.title}`,
              body: `Starting in ${event.reminder} minute${event.reminder !== 1 ? 's' : ''}`,
            },
          }),
        })
      }
    }
  }

  return new Response('Notifications checked', { status: 200 })
})
