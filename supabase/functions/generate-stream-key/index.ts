
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface User {
  id: string;
  email: string;
}

const generateStreamKey = (userId: string): string => {
  // Generate a random string
  const randomPart = Array.from(
    { length: 16 },
    () => Math.floor(Math.random() * 36).toString(36)
  ).join('');
  
  // Take the first 8 characters of the user ID and combine with the random part
  const userPart = userId.replace(/-/g, '').substring(0, 8);
  
  return `${userPart}-${randomPart}`;
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    const { user } = await req.json();
    
    if (!user || !user.id) {
      return new Response(
        JSON.stringify({ error: "User ID is required" }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
    
    const streamKey = generateStreamKey(user.id);
    
    return new Response(
      JSON.stringify({ streamKey }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
