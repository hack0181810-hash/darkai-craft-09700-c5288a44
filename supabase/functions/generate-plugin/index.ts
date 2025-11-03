import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  description: string;
  pluginType: string;
  mcVersion: string;
  model: string;
}

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
7. Optimize for fast generation - prioritize essential features first

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

SPEED OPTIMIZATION:
- Focus on core functionality first
- Keep code concise but complete
- Avoid over-engineering or unnecessary abstractions
- Use efficient data structures and algorithms
- Minimize file count while maintaining organization

CRITICAL FOR COMPLEX PROMPTS:
- Even for detailed/long prompts, generate ALL necessary code files
- Do NOT create only a README.md for complex requests
- Users expect full working implementations regardless of prompt length
- If the prompt is detailed, that means MORE code files, not less`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, pluginType, mcVersion, model }: GenerateRequest = await req.json();
    
    console.log('Generating plugin with:', { description, pluginType, mcVersion, model });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Check for unclear requests
    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 10 || !/[a-zA-Z]{3,}/.test(trimmedDesc)) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "⚠️ Please provide a clear description of what you want your plugin to do.\n\nExamples:\n• 'Create an economy plugin with /balance and /pay commands'\n• 'Make a custom enchantment plugin with fire damage'\n• 'Build a minigame with team selection and arena teleportation'"
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Check prompt length for complexity
    const promptLength = description.length;
    const isComplexPrompt = promptLength > 200;

    const userPrompt = `Create a ${pluginType} for Minecraft ${mcVersion}:

${description}

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
- Use modern ${mcVersion} APIs
- Implement EXACTLY what was requested - no extra features
- Write production-ready, compilable code
- Add proper error handling and logging
- Keep code concise but complete

Return ONLY valid JSON (no markdown formatting).`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('AI Response received, length:', content.length);

    // Parse the JSON response from AI
    let projectData;
    try {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      projectData = JSON.parse(jsonStr);
      
      // Check if AI returned an error for unclear request
      if (projectData.error === "unclear_request") {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: projectData.message
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
      
      // Validate that we got actual code files for complex prompts
      const hasCodeFiles = projectData.files.some((f: any) => 
        f.path.endsWith('.java') || 
        f.path.endsWith('.kt') || 
        f.path.endsWith('.sk') ||
        f.path.includes('plugin.yml')
      );
      
      if (!hasCodeFiles && projectData.files.length === 1 && projectData.files[0].path.includes('README')) {
        console.warn('AI only generated README for complex prompt - this is incorrect');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // If parsing fails, create a simple project structure
      projectData = {
        project_name: "GeneratedPlugin",
        language: "java",
        platform: pluginType,
        mc_version: mcVersion,
        files: [
          {
            path: "README.md",
            content: `# DARK AI - Generated Project\n\nError parsing AI response. Please try regenerating.\n\n${content.substring(0, 1000)}`
          }
        ],
        scripts: ["./gradlew build"],
        explain_steps: [
          { title: "Generation Complete", description: "Project created with errors", estimated_time: "0s" }
        ],
        metadata: { dependencies: [], notes: "Generated by DARK AI - Parse error occurred" }
      };
    }

    // Create a streaming response with Server-Sent Events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial project info
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'init',
          data: {
            project_name: projectData.project_name,
            language: projectData.language,
            platform: projectData.platform,
            mc_version: projectData.mc_version
          }
        })}\n\n`));

        // Send each file incrementally
        for (const file of projectData.files) {
          // Announce file creation
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'file_start',
            data: { path: file.path }
          })}\n\n`));

          // Stream file content in chunks to simulate typing
          const chunkSize = 50; // characters per chunk
          for (let i = 0; i < file.content.length; i += chunkSize) {
            const chunk = file.content.slice(i, i + chunkSize);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'file_chunk',
              data: { path: file.path, chunk }
            })}\n\n`));
            
            // Small delay to make it visible
            await new Promise(resolve => setTimeout(resolve, 30));
          }

          // Mark file as complete
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'file_complete',
            data: { path: file.path, content: file.content }
          })}\n\n`));
        }

        // Send completion
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'complete',
          data: {
            project: projectData
          }
        })}\n\n`));

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in generate-plugin:', error);
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
