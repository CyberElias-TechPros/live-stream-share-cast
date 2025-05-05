
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Generate a secure random string for stream keys
function generateStreamKey(length = 16) {
  const allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let streamKey = '';
  
  // Create array of random values
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  // Convert random values to characters
  for (let i = 0; i < length; i++) {
    streamKey += allowedChars.charAt(randomValues[i] % allowedChars.length);
  }
  
  return streamKey;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Verify token and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Check if user is a streamer
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_streamer')
      .eq('id', user.id)
      .single();
    
    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // If not a streamer, update the profile to make them one
    if (!profile.is_streamer) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_streamer: true })
        .eq('id', user.id);
      
      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to update streamer status' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // Generate a unique stream key
    let isUnique = false;
    let streamKey = '';
    
    while (!isUnique) {
      streamKey = generateStreamKey();
      
      // Check if key already exists
      const { data, error } = await supabase
        .from('streams')
        .select('id')
        .eq('stream_key', streamKey);
      
      if (error) {
        return new Response(
          JSON.stringify({ error: 'Database error' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // If no matches found, key is unique
      if (data.length === 0) {
        isUnique = true;
      }
    }
    
    return new Response(
      JSON.stringify({ stream_key: streamKey }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Error generating stream key:', err);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
