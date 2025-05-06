
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
    
    console.log('Setting up scheduled cleanup for expired recordings')
    
    // First, check if the cron job is already set up
    const { data: cronJobs, error: cronError } = await supabase.rpc('cron_job_exists', {
      job_name: 'cleanup-expired-recordings'
    })
    
    if (cronError) {
      console.error('Error checking for existing cron job:', cronError)
      throw new Error('Failed to check for existing cron job')
    }
    
    // If the job doesn't exist yet, create it
    if (!cronJobs || cronJobs.length === 0) {
      // Create a cron job to run every hour
      const { data, error } = await supabase.rpc('cron_schedule', {
        job_name: 'cleanup-expired-recordings',
        schedule: '0 * * * *', // Run once per hour
        command: `
          select
            net.http_post(
              url:='https://earvjqvafjivvgrfeqxn.supabase.co/functions/v1/cleanup-recordings',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseKey}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
        `
      })
      
      if (error) {
        console.error('Error scheduling cron job:', error)
        throw new Error('Failed to schedule cleanup job')
      }
      
      console.log('Scheduled cleanup job successfully')
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Scheduled cleanup job successfully'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    } else {
      console.log('Cleanup job already scheduled')
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Cleanup job already scheduled'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }
  } catch (error) {
    console.error('Error setting up cleanup schedule:', error)
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
