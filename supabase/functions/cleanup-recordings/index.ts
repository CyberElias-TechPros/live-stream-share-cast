
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

    // Get current time
    const now = new Date()
    
    console.log(`Starting expired recordings cleanup at ${now.toISOString()}`)

    // Find expired recordings
    const { data: expiredRecordings, error: fetchError } = await supabase
      .from('streams')
      .select('id, recording_url, recording_expiry')
      .lt('recording_expiry', now.toISOString())
      .not('recording_url', 'is', null)
    
    if (fetchError) {
      console.error('Error fetching expired recordings:', fetchError)
      throw fetchError
    }

    console.log(`Found ${expiredRecordings?.length || 0} expired recordings`)

    // Process each expired recording
    const results = await Promise.all((expiredRecordings || []).map(async (recording) => {
      console.log(`Cleaning up recording for stream: ${recording.id}`)
      
      try {
        // Extract storage path from URL
        const urlParts = recording.recording_url?.split('/storage/v1/object/public/')
        if (urlParts && urlParts.length > 1) {
          const path = urlParts[1]
          const bucketPath = path.split('/')
          const bucket = bucketPath[0]
          const filePath = bucketPath.slice(1).join('/')
          
          // Delete the file from storage
          const { error: storageError } = await supabase
            .storage
            .from(bucket)
            .remove([filePath])
          
          if (storageError) {
            console.error(`Error deleting storage object: ${storageError.message}`)
          } else {
            console.log(`Deleted storage object: ${filePath}`)
          }
        }
        
        // Update the stream record
        const { error: updateError } = await supabase
          .from('streams')
          .update({
            recording_url: null,
            recording_expiry: null,
          })
          .eq('id', recording.id)
        
        if (updateError) {
          console.error(`Error updating stream record: ${updateError.message}`)
          return { id: recording.id, success: false, error: updateError.message }
        }
        
        return { id: recording.id, success: true }
      } catch (err) {
        console.error(`Error processing recording ${recording.id}:`, err)
        return { id: recording.id, success: false, error: err.message }
      }
    }))

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} expired recordings`,
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in cleanup-recordings function:', error)
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
