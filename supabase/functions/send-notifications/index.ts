import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIREBASE_PROJECT_ID = 'my-productivity-app-ab66b'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('DB_SERVICE_ROLE_KEY')!
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const header = { alg: 'RS256', typ: 'JWT' }
  const enc = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const input = `${enc(header)}.${enc(claim)}`
  const privateKey = SERVICE_ACCOUNT.private_key
  const pemContents = privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${input}.${sigB64}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  console.log('Token response:', data.access_token ? 'OK' : JSON.stringify(data))
  return data.access_token
}

serve(async () => {
  try {
    console.log('Function started at:', new Date().toISOString())
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: events, error: evError } = await supabase.from('cals').select('*').gt('reminder', 0)
    console.log('Events found:', events?.length, evError?.message)
    const { data: tokens, error: tokError } = await supabase.from('fcm_tokens').select('token')
    console.log('Tokens found:', tokens?.length, tokError?.message)
    if (!events || !tokens || tokens.length === 0) return new Response('No data', { status: 200 })
    const accessToken = await getFirebaseAccessToken()
    const now = new Date()
    for (const event of events) {
      // Treat stored times as PDT (UTC-7) since events are entered in local time
      const eventTime = new Date(`${event.date}T${event.time}:00-07:00`)
      const reminderTime = new Date(eventTime.getTime() - event.reminder * 60 * 1000)
      const diff = Math.abs(reminderTime.getTime() - now.getTime())
      console.log(`Event: ${event.title}, reminderTime: ${reminderTime.toISOString()}, diff: ${diff}ms, threshold: 60000ms`)
      if (diff < 60000) {
        console.log('Sending notification for:', event.title)
        for (const { token } of tokens) {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`, {
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
          const resData = await res.json()
          console.log('FCM response:', JSON.stringify(resData))
        }
      }
    }
    return new Response('Notifications checked', { status: 200 })
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(`Error: ${err.message}`, { status: 500 })
  }
})
