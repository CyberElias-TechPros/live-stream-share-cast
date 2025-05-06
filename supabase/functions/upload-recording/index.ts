
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
      throw new Error('Missing or invalid auth token')
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid auth token or user not found')
    }
    
    // Parse the multipart form data to get the file
    const formData = await req.formData()
    const file = formData.get('file')
    
    if (!file || !(file instanceof File)) {
      throw new Error('No file or invalid file provided')
    }
    
    // Generate a unique file name
    const timestamp = new Date().getTime()
    const fileName = `${user.id}_${timestamp}_${file.name}`
    
    // Upload to "recordings" bucket
    const { data, error } = await supabase
      .storage
      .from('recordings')
      .upload(`${user.id}/${fileName}`, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      })
    
    if (error) {
      throw error
    }
    
    // Get public URL for the file
    const { data: { publicUrl } } = supabase
      .storage
      .from('recordings')
      .getPublicUrl(`${user.id}/${fileName}`)
    
    console.log(`Recording uploaded: ${fileName}`)
    
    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        fileName: fileName,
        size: file.size,
        type: file.type
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error handling request:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
