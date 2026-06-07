import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIREBASE_PROJECT_ID = 'my-productivity-app-ab66b'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('DB_SERVICE_ROLE_KEY')!
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    iss: SERVICE_ACCOUNT.client_email,
    sub: SERVICE_ACCOUNT.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  }))
  const signInput = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(SERVICE_ACCOUNT.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signInput))
  const jwt = `${signInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const binary = atob(b64)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: events } = await supabase.from('cals').select('*').gt('reminder', 0)
    const { data: tokens } = await supabase.from('fcm_tokens').select('token')
    if (!events || !tokens || tokens.length === 0) return new Response('No data', { status: 200 })
    const now = new Date()
    const accessToken = await getFirebaseAccessToken()
    for (const event of events) {
      const eventTime = new Date(`${event.date}T${event.time}`)
      const reminderTime = new Date(eventTime.getTime() - event.reminder * 60 * 1000)
      const diff = Math.abs(reminderTime.getTime() - now.getTime())
      if (diff < 60000) {
        for (const { token } of tokens) {
          await fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title: `📅 ${event.title}`,
                  body: `Starting in ${event.reminder} minute${event.reminder !== 1 ? 's' : ''}`,
                }
              }
            }),
          })
        }
      }
    }
    return new Response('Notifications checked', { status: 200 })
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 })
  }
})
