import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompileRequest {
  project_name: string;
  files: Array<{ path: string; content: string }>;
  platform: string;
  scripts: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_name, files, platform, scripts }: CompileRequest = await req.json();
    
    console.log('Compiling project:', project_name);

    // NOTE: This creates a SIMULATED JAR for demonstration purposes only
    // Real Minecraft plugins require actual Java compilation with:
    // 1. Java SDK (JDK 17+ for modern MC versions)
    // 2. Gradle or Maven build system
    // 3. Proper dependency resolution
    // 
    // To create a REAL working plugin JAR:
    // 1. Download the source files
    // 2. Install Java JDK and Gradle on your computer
    // 3. Run: ./gradlew build
    // 4. Find the compiled JAR in build/libs/
    //
    // The JAR created here contains source files and placeholders,
    // NOT compiled bytecode, so it WON'T work on a Minecraft server
    
    const jarFiles: Array<{ path: string; content: string }> = [];
    
    // Add META-INF/MANIFEST.MF
    jarFiles.push({
      path: 'META-INF/MANIFEST.MF',
      content: `Manifest-Version: 1.0
Created-By: DARK AI
Main-Class: ${findMainClass(files)}
`
    });

    // Process Java files to simulate compilation
    files.forEach(file => {
      if (file.path.endsWith('.java')) {
        // Convert .java to .class path
        const classPath = file.path
          .replace('src/main/java/', '')
          .replace('.java', '.class');
        jarFiles.push({
          path: classPath,
          content: `[Compiled bytecode placeholder for ${file.path}]`
        });
      } else if (file.path.includes('resources/')) {
        // Include resource files directly
        const resourcePath = file.path.replace('src/main/resources/', '');
        jarFiles.push({
          path: resourcePath,
          content: file.content
        });
      }
    });

    // Create a simple text representation of the JAR
    // In reality, this would be a binary ZIP file
    let jarContent = `DARK AI Compiled Plugin - ${project_name}\n\n`;
    jarContent += `Platform: ${platform}\n`;
    jarContent += `Build Command: ${scripts[0] || './gradlew build'}\n\n`;
    jarContent += `=== JAR Contents ===\n\n`;
    
    jarFiles.forEach(file => {
      jarContent += `File: ${file.path}\n`;
      if (file.content.length < 200) {
        jarContent += `${file.content}\n`;
      } else {
        jarContent += `${file.content.substring(0, 200)}...\n`;
      }
      jarContent += '\n---\n\n';
    });

    // Add source files at the end for reference
    jarContent += `\n=== Source Files (Reference) ===\n\n`;
    files.forEach(file => {
      jarContent += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
    });

    // Convert to base64 for transfer
    const encoder = new TextEncoder();
    const data = encoder.encode(jarContent);
    const base64 = btoa(String.fromCharCode(...data));

    console.log('Compilation complete, JAR size:', data.length, 'bytes');

    return new Response(
      JSON.stringify({ 
        success: true, 
        jar_data: base64,
        jar_name: `${project_name}-DEMO-1.0.jar`,
        size: data.length,
        message: 'Demo JAR created (NOT a real compiled plugin)',
        note: 'This is a simulated JAR. To create a real working plugin, download the source files and compile them locally using Gradle or Maven with Java JDK installed.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in compile-plugin:', error);
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

function findMainClass(files: Array<{ path: string; content: string }>): string {
  for (const file of files) {
    if (file.path.endsWith('.java') && file.content.includes('extends JavaPlugin')) {
      // Extract package and class name
      const packageMatch = file.content.match(/package\s+([\w.]+);/);
      const classMatch = file.content.match(/public\s+class\s+(\w+)/);
      
      if (packageMatch && classMatch) {
        return `${packageMatch[1]}.${classMatch[1]}`;
      }
    }
  }
  return 'com.example.plugin.Main';
}
