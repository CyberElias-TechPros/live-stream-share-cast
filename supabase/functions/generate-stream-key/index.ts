
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the function
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Get the token from the request
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Missing auth token')
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid auth token or user not found')
    }
    
    // Check if the user is a streamer
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_streamer')
      .eq('id', user.id)
      .single()
    
    if (profileError) {
      throw new Error('Error fetching user profile')
    }
    
    if (!profile.is_streamer) {
      throw new Error('User is not a streamer')
    }
    
    // Generate a unique stream key
    const streamKey = generateStreamKey(user.id)
    
    console.log(`Generated stream key for user ${user.id}`)
    
    return new Response(
      JSON.stringify({
        stream_key: streamKey
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error generating stream key:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})

// Generate a secure, unique stream key
function generateStreamKey(userId: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  const userHash = userId.split('-')[0]
  
  return `stream_${userHash}_${timestamp}_${random}`
}
