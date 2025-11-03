import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are DARK AI — an elite Minecraft plugin developer. Generate COMPLETE, PRODUCTION-READY code that compiles successfully.

RESPONSE FORMAT (JSON only, no markdown):
{
 "project_name": "DescriptiveName",
 "language": "java|kotlin|skript|datapack",
 "platform": "paper|spigot|velocity|bukkit|skript|datapack|fabric|forge",
 "mc_version": "version",
 "files": [{ "path": "full/path/to/file.java", "content": "complete file content" }],
 "scripts": ["./gradlew build"],
 "explain_steps": [{ "title": "Step", "description": "What this does", "estimated_time": "5s" }],
 "metadata": { "dependencies": ["dep1"], "notes": "Brief implementation notes" }
}

STRICT RULES:
1. READ THE REQUEST CAREFULLY - implement EXACTLY what user asks for
2. Include ALL required files: plugin.yml, main class, build.gradle/build.gradle.kts, config.yml
3. Use MODERN APIs matching the specified MC version
4. Add proper error handling, logging, and null checks
5. Include command tab completion and permission nodes
6. Write CONCISE but COMPLETE code - no placeholder comments
7. For COMPLEX prompts, generate ALL necessary files, not just README

CODE STRUCTURE:
- Paper/Spigot/Bukkit: Main class extends JavaPlugin, proper event handlers, config management
- Skript: Single .sk file with proper syntax and organized sections
- Datapacks: Complete data folder structure with functions, predicates, tags
- Fabric/Forge: Main mod class, fabric.mod.json/mods.toml, proper registration

ACCURACY REQUIREMENTS:
- Match user's exact feature requests - don't add unnecessary extras
- Use correct package names and class structure
- Include only dependencies that are actually needed
- Write compilable code with proper imports and syntax
- Test edge cases: null checks, empty collections, invalid inputs

IMPORTANT: For large/complex prompts, you MUST still generate all necessary code files. 
Do NOT just create a README.md. Users expect full plugin implementation.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { job_id } = await req.json();

    // Fetch job details
    const { data: job, error: jobError } = await supabaseClient
      .from('generation_jobs')
      .select('*')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      throw new Error('Job not found');
    }

    // Update job status to processing
    await supabaseClient
      .from('generation_jobs')
      .update({ status: 'processing', progress: 10 })
      .eq('id', job_id);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build user prompt with emphasis for large prompts
    const promptLength = job.description.length;
    const isComplexPrompt = promptLength > 200;
    
    const userPrompt = `Create a ${job.plugin_type} for Minecraft ${job.mc_version}:

${job.description}

${isComplexPrompt ? `
⚠️ IMPORTANT: This is a COMPLEX/DETAILED request.
You MUST generate ALL necessary code files including:
- Main plugin class with full implementation
- All required configuration files (plugin.yml, config.yml)
- Build files (build.gradle/build.gradle.kts)
- Event handlers, commands, and utilities as described
- Do NOT just create a README.md file
` : ''}

Requirements:
- Include ALL necessary files (plugin.yml, main class, build file, config)
- Use modern ${job.mc_version} APIs
- Implement EXACTLY what was requested - no extra features
- Write production-ready, compilable code
- Add proper error handling and logging
- Keep code concise but complete

Return ONLY valid JSON (no markdown formatting).`;

    await supabaseClient
      .from('generation_jobs')
      .update({ progress: 20 })
      .eq('id', job_id);

    console.log('Calling AI for job:', job_id);
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: job.model || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      await supabaseClient
        .from('generation_jobs')
        .update({ 
          status: 'failed', 
          error_message: `AI Gateway error: ${response.status}` 
        })
        .eq('id', job_id);

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    await supabaseClient
      .from('generation_jobs')
      .update({ progress: 60 })
      .eq('id', job_id);

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log('AI Response received, length:', content.length);

    // Parse the JSON response from AI
    let projectData;
    try {
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      projectData = JSON.parse(jsonStr);
      
      // Validate that we got actual code files, not just README
      const hasCodeFiles = projectData.files.some((f: any) => 
        f.path.endsWith('.java') || 
        f.path.endsWith('.kt') || 
        f.path.endsWith('.sk') ||
        f.path.includes('plugin.yml')
      );
      
      if (!hasCodeFiles && projectData.files.length === 1 && projectData.files[0].path.includes('README')) {
        // AI only generated README - this is a problem for complex prompts
        throw new Error('AI generated only README. Need full code implementation.');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      await supabaseClient
        .from('generation_jobs')
        .update({ 
          status: 'failed', 
          error_message: 'Failed to parse AI response. Please try again or simplify your prompt.' 
        })
        .eq('id', job_id);

      throw parseError;
    }

    await supabaseClient
      .from('generation_jobs')
      .update({ progress: 90 })
      .eq('id', job_id);

    // Save project to database
    const { error: insertError } = await supabaseClient
      .from('projects')
      .insert({
        user_id: user.id,
        project_name: projectData.project_name,
        description: job.description,
        language: projectData.language,
        platform: projectData.platform,
        mc_version: projectData.mc_version,
        files: projectData.files,
        scripts: projectData.scripts,
        metadata: projectData.metadata,
      });

    if (insertError) {
      console.error('Failed to save project:', insertError);
    }

    // Mark job as completed
    await supabaseClient
      .from('generation_jobs')
      .update({ 
        status: 'completed',
        progress: 100,
        project_data: projectData,
        completed_at: new Date().toISOString()
      })
      .eq('id', job_id);

    console.log('Job completed successfully:', job_id);

    return new Response(
      JSON.stringify({ success: true, project: projectData }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in generate-plugin-background:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});