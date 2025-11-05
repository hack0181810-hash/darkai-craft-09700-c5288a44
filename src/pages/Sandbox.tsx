import { useState, useEffect, useMemo, memo, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GenerationForm } from "@/components/GenerationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { GenerationStatus } from "@/components/GenerationStatus";

import {
  Play,
  Download,
  RotateCw,
  FileCode,
  Terminal,
  Sparkles,
  FolderOpen,
  File,
  Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";

interface ProjectFile {
  path: string;
  content: string;
}

interface ProjectData {
  project_name: string;
  language: string;
  platform: string;
  mc_version: string;
  files: ProjectFile[];
  scripts: string[];
  explain_steps: Array<{ title: string; description: string; estimated_time: string }>;
  metadata: { dependencies: string[]; notes: string };
}

interface BuildLog {
  time: string;
  message: string;
  type: "info" | "success" | "error";
}

const MemoizedEditor = memo(Editor);

export default function Sandbox() {
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [buildLogs, setBuildLogs] = useState<BuildLog[]>([]);
  const [generationModel, setGenerationModel] = useState("google/gemini-2.5-flash");
  const [compiledJar, setCompiledJar] = useState<{ data: string; name: string } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);
  const [hasGenerationError, setHasGenerationError] = useState(false);
  const [buildConsoleRef, setBuildConsoleRef] = useState<HTMLDivElement | null>(null);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [useBackgroundGeneration, setUseBackgroundGeneration] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        toast.error("Please login to use the sandbox");
        navigate("/auth");
      } else {
        setUser(data.user);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (location.state?.project) {
      const proj = location.state.project;
      setProject({
        project_name: proj.project_name,
        language: proj.language || "java",
        platform: proj.platform,
        mc_version: proj.mc_version,
        files: proj.files,
        scripts: proj.scripts || [],
        explain_steps: [],
        metadata: proj.metadata || {},
      });
      setSelectedFile(proj.files[0] || null);
    }
    
    // Handle generation triggered from Generate page
    if (location.state?.startGeneration && location.state?.generateData) {
      const data = location.state.generateData;
      handleGenerate(data);
      // Clear the state to prevent re-triggering
      navigate(location.pathname, { replace: true });
    }
  }, [location]);

  const handleGenerate = async (data: {
    description: string;
    pluginType: string;
    mcVersion: string;
    model: string;
  }) => {
    // For long prompts (>300 chars), use background generation
    const shouldUseBackground = data.description.length > 300;
    
    if (shouldUseBackground) {
      try {
        // Create a generation job
        const { data: jobData, error: jobError } = await supabase
          .from('generation_jobs')
          .insert({
            user_id: user.id,
            description: data.description,
            plugin_type: data.pluginType,
            mc_version: data.mcVersion,
            model: data.model,
            status: 'pending'
          })
          .select()
          .single();

        if (jobError) throw jobError;

        // Start background processing
        setGenerationJobId(jobData.id);
        setUseBackgroundGeneration(true);
        
        // Trigger the background function
        supabase.functions.invoke('generate-plugin-background', {
          body: { job_id: jobData.id }
        });

        toast.info("Large prompt detected - Using background generation");
      } catch (error: any) {
        console.error('Failed to start background generation:', error);
        toast.error('Failed to start generation');
      }
      return;
    }
    
    setIsGenerating(true);
    setGenerationModel(data.model);
    setHasGenerationError(false);
    
    // Create initial empty project to open sandbox immediately
    const emptyProject: ProjectData = {
      project_name: "Generating...",
      language: "java",
      platform: data.pluginType,
      mc_version: data.mcVersion,
      files: [],
      scripts: [],
      explain_steps: [],
      metadata: { dependencies: [], notes: "" },
    };
    
    setProject(emptyProject);
    
    setBuildLogs([
      { time: new Date().toLocaleTimeString(), message: "🚀 Starting AI generation...", type: "info" },
      { time: new Date().toLocaleTimeString(), message: "🤖 Analyzing your requirements...", type: "info" },
    ]);

    try {
      // Use streaming fetch instead of supabase invoke
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-plugin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const fileContents = new Map<string, string>();
      let finalProject: ProjectData | null = null;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          
          try {
            const event = JSON.parse(line.slice(6));
            
            switch (event.type) {
              case 'init':
                setProject(prev => ({
                  ...prev!,
                  project_name: event.data.project_name,
                  language: event.data.language,
                  platform: event.data.platform,
                  mc_version: event.data.mc_version,
                }));
                setBuildLogs(prev => {
                  const newLogs = [...prev, {
                    time: new Date().toLocaleTimeString(),
                    message: `📦 Creating project: ${event.data.project_name}`,
                    type: "success" as const,
                  }];
                  // Auto-scroll after state update
                  setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
                  return newLogs;
                });
                break;

              case 'file_start':
                const fileName = event.data.path.split('/').pop();
                const folderPath = event.data.path.split('/').slice(0, -1).join('/');
                
                fileContents.set(event.data.path, '');
                
                setProject(prev => ({
                  ...prev!,
                  files: [...prev!.files, { path: event.data.path, content: '' }],
                }));
                
                setBuildLogs(prev => {
                  const newLogs = [...prev];
                  if (folderPath) {
                    newLogs.push({
                      time: new Date().toLocaleTimeString(),
                      message: `📁 Creating folder: ${folderPath}`,
                      type: "info" as const,
                    });
                  }
                  newLogs.push({
                    time: new Date().toLocaleTimeString(),
                    message: `📄 Writing file: ${fileName}`,
                    type: "info" as const,
                  });
                  setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
                  return newLogs;
                });
                break;

              case 'file_chunk':
                const currentContent = fileContents.get(event.data.path) || '';
                const newContent = currentContent + event.data.chunk;
                fileContents.set(event.data.path, newContent);
                
                setProject(prev => ({
                  ...prev!,
                  files: prev!.files.map(f => 
                    f.path === event.data.path 
                      ? { ...f, content: newContent }
                      : f
                  ),
                }));
                
                // Auto-select first file when it starts getting content
                if (!selectedFile && newContent.length > 0) {
                  setSelectedFile({ path: event.data.path, content: newContent });
                }
                break;

              case 'file_complete':
                setBuildLogs(prev => {
                  const newLogs = [...prev, {
                    time: new Date().toLocaleTimeString(),
                    message: `✅ Completed: ${event.data.path.split('/').pop()}`,
                    type: "success" as const,
                  }];
                  setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
                  return newLogs;
                });
                break;

              case 'complete':
                finalProject = event.data.project;
                setProject(finalProject);
                setSelectedFile(finalProject.files[0] || null);
                setBuildLogs(prev => {
                  const newLogs = [...prev, {
                    time: new Date().toLocaleTimeString(),
                    message: `🎉 Generated ${finalProject!.files.length} files successfully!`,
                    type: "success" as const,
                  }];
                  setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
                  return newLogs;
                });
                break;
              
              case 'error':
                setHasGenerationError(true);
                setBuildLogs(prev => {
                  const newLogs = [...prev, {
                    time: new Date().toLocaleTimeString(),
                    message: `❌ Error detected: ${event.data.message || 'Unknown error'}`,
                    type: "error" as const,
                  }, {
                    time: new Date().toLocaleTimeString(),
                    message: `🔧 Click "Auto Fix" button to resolve the issue`,
                    type: "info" as const,
                  }];
                  setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
                  return newLogs;
                });
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }

      // Save to database if user is logged in
      if (user && finalProject) {
        const { error: insertError } = await (supabase as any).from("projects").insert({
          user_id: user.id,
          project_name: finalProject.project_name,
          description: data.description,
          language: finalProject.language,
          platform: finalProject.platform,
          mc_version: finalProject.mc_version,
          files: finalProject.files as any,
          scripts: finalProject.scripts,
          metadata: finalProject.metadata as any,
        });
        
        if (insertError) {
          console.error('Failed to save project:', insertError);
        }
      }
      
      toast.success("Plugin generated successfully!");
    } catch (error: any) {
      console.error("Generation error:", error);
      setHasGenerationError(true);
      setBuildLogs((prev) => {
        const newLogs = [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            message: `❌ Error: ${error.message}`,
            type: "error" as const,
          },
          {
            time: new Date().toLocaleTimeString(),
            message: `🔧 Generation stopped. Click "Auto Fix" to resolve and continue`,
            type: "info" as const,
          }
        ];
        setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
        return newLogs;
      });
      toast.error("Generation error - Click Auto Fix to resolve");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompile = async () => {
    if (!project) return;
    
    setIsCompiling(true);
    setCompiledJar(null);
    setBuildLogs([
      { time: new Date().toLocaleTimeString(), message: "Starting compilation...", type: "info" },
      {
        time: new Date().toLocaleTimeString(),
        message: `Running: ${project.scripts[0] || "./gradlew build"}`,
        type: "info",
      },
    ]);

    try {
      const { data: result, error } = await supabase.functions.invoke("compile-plugin", {
        body: {
          project_name: project.project_name,
          files: project.files,
          platform: project.platform,
          scripts: project.scripts,
        },
      });

      if (error) throw error;

      if (result.success) {
        setCompiledJar({ data: result.jar_data, name: result.jar_name });
        setBuildLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            message: "Creating demo JAR structure...",
            type: "info",
          },
          {
            time: new Date().toLocaleTimeString(),
            message: `✅ Demo JAR created: ${result.jar_name} (${Math.round(result.size / 1024)}KB)`,
            type: "success",
          },
          {
            time: new Date().toLocaleTimeString(),
            message: "⚠️ NOTE: This is a SIMULATED JAR for demonstration only",
            type: "info",
          },
          {
            time: new Date().toLocaleTimeString(),
            message: "📥 To create a REAL working plugin: Download source files and compile locally with Gradle/Maven",
            type: "info",
          },
        ]);
        toast.success("Demo JAR created! See console for important notes.");
      } else {
        throw new Error(result.error || "Compilation failed");
      }
    } catch (error: any) {
      console.error("Compilation error:", error);
      setBuildLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          message: `Compilation failed: ${error.message}`,
          type: "error",
        },
      ]);
      toast.error("Failed to compile plugin");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleAutoFix = async () => {
    if (!project) return;

    setIsFixing(true);
    setHasGenerationError(false);
    const buildLogText = buildLogs.map((log) => `[${log.time}] ${log.message}`).join("\n");
    
    setBuildLogs((prev) => {
      const newLogs = [...prev, {
        time: new Date().toLocaleTimeString(),
        message: `🔧 Running auto-fix analysis...`,
        type: "info" as const,
      }];
      setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
      return newLogs;
    });

    try {
      const { data: result, error } = await supabase.functions.invoke("auto-fix", {
        body: {
          buildLog: buildLogText,
          files: project.files,
          model: generationModel,
        },
      });

      if (error) throw error;

      if (result.success && result.fixes) {
        // Apply patches
        const patches = result.fixes.patches || [];
        if (patches.length > 0) {
          const updatedFiles = project.files.map((file) => {
            const patch = patches.find((p: any) => p.path === file.path);
            return patch ? { ...file, content: patch.new_content } : file;
          });

          setProject({ ...project, files: updatedFiles });
          setBuildLogs((prev) => {
            const newLogs = [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                message: `✅ Applied ${patches.length} fixes. ${result.fixes.explanation}`,
                type: "success" as const,
              },
              {
                time: new Date().toLocaleTimeString(),
                message: `🎉 Resuming code generation...`,
                type: "info" as const,
              }
            ];
            setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
            return newLogs;
          });
          toast.success("Auto-fix applied! Generation continuing...");
        } else {
          setBuildLogs((prev) => {
            const newLogs = [...prev, {
              time: new Date().toLocaleTimeString(),
              message: "✅ No fixes needed. Code looks good!",
              type: "info" as const,
            }];
            setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 50);
            return newLogs;
          });
          toast.info("No fixes needed");
        }
      }
    } catch (error: any) {
      console.error("Auto-fix error:", error);
      toast.error("Failed to apply auto-fix");
    } finally {
      setIsFixing(false);
    }
  };

  const handleDownload = () => {
    if (!project) return;

    if (compiledJar) {
      // Download compiled JAR
      const binaryString = atob(compiledJar.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/java-archive" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = compiledJar.name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JAR downloaded!");
    } else {
      // Download source files as text
      let content = `# ${project.project_name}\n\n`;
      content += `Platform: ${project.platform}\n`;
      content += `MC Version: ${project.mc_version}\n\n`;
      content += `## Files\n\n`;

      project.files.forEach((file) => {
        content += `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      });

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.project_name}-source.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Source files downloaded!");
    }
  };

  // Optimized file edit with debouncing
  const handleFileEdit = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (newContent: string | undefined) => {
      if (!selectedFile || !project || !newContent) return;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const updatedFiles = project.files.map((file) =>
          file.path === selectedFile.path ? { ...file, content: newContent } : file
        );

        setProject({ ...project, files: updatedFiles });
        setSelectedFile({ ...selectedFile, content: newContent });
      }, 150);
    };
  }, [selectedFile, project]);

  const handleAiPrompt = async () => {
    if (!aiPrompt.trim() || !project) return;
    
    setIsProcessingPrompt(true);
    setHasGenerationError(false);
    const promptMsg = aiPrompt.substring(0, 100);
    setBuildLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), message: `🔄 Processing request: ${promptMsg}`, type: "info" },
    ]);

    try {
      const { data: result, error } = await supabase.functions.invoke("update-plugin", {
        body: {
          prompt: aiPrompt,
          existingFiles: project.files,
          platform: project.platform,
          mcVersion: project.mc_version,
          model: generationModel,
        },
      });

      if (error) throw error;

      if (result.success && result.updates) {
        const { updates, summary } = result.updates;
        
        const changeLog: Array<{ time: string; message: string; type: "info" | "success" | "error" }> = [];
        
        // Apply updates to existing files
        const updatedFiles = project.files.map((file) => {
          const update = updates.find((u: any) => u.path === file.path);
          if (update) {
            changeLog.push({ 
              time: new Date().toLocaleTimeString(), 
              message: `✏️ Updated: ${file.path} - ${update.description || 'Modified'}`, 
              type: "success" 
            });
            return { ...file, content: update.content };
          }
          return file;
        });

        // Add any new files
        const newFiles = updates.filter((u: any) => 
          !project.files.some(f => f.path === u.path)
        );
        
        newFiles.forEach((newFile: any) => {
          changeLog.push({ 
            time: new Date().toLocaleTimeString(), 
            message: `📄 Created: ${newFile.path} - ${newFile.description || 'New file'}`, 
            type: "success" 
          });
          updatedFiles.push({ path: newFile.path, content: newFile.content });
        });

        setProject({ ...project, files: updatedFiles });
        
        // Update selected file if it was modified
        if (selectedFile) {
          const updatedSelected = updatedFiles.find(f => f.path === selectedFile.path);
          if (updatedSelected) {
            setSelectedFile(updatedSelected);
          }
        }

        const finalLogs = [
          ...changeLog,
          { 
            time: new Date().toLocaleTimeString(), 
            message: `✅ Update Complete: ${summary || `${changeLog.length} file(s) modified`}`, 
            type: "success" as const
          },
        ];
        
        setBuildLogs((prev) => [...prev, ...finalLogs]);
        setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 100);
        
        toast.success(`Successfully updated ${changeLog.length} file(s)`);
        setAiPrompt("");
      }
    } catch (error: any) {
      setHasGenerationError(true);
      const errorLogs = [
        { time: new Date().toLocaleTimeString(), message: `❌ Error: ${error.message}`, type: "error" as const },
        { time: new Date().toLocaleTimeString(), message: `⚠️ Update failed. Click the 'Auto Fix' button to resolve issues automatically.`, type: "info" as const },
      ];
      setBuildLogs((prev) => [...prev, ...errorLogs]);
      setTimeout(() => buildConsoleRef?.scrollTo(0, buildConsoleRef.scrollHeight), 100);
      toast.error("Update failed - Click Auto Fix to resolve");
    } finally {
      setIsProcessingPrompt(false);
    }
  };

  if (useBackgroundGeneration && generationJobId) {
    return (
      <div className="min-h-screen bg-background">
        <GenerationStatus
          jobId={generationJobId}
          onComplete={(projectData) => {
            setProject(projectData);
            setSelectedFile(projectData.files[0] || null);
            setUseBackgroundGeneration(false);
            setGenerationJobId(null);
          }}
          onCancel={() => {
            setUseBackgroundGeneration(false);
            setGenerationJobId(null);
          }}
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <GenerationForm onGenerate={handleGenerate} isGenerating={isGenerating} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="h-screen flex flex-col">
        {/* Top bar */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm px-3 md:px-6 py-3 md:py-4 relative">
            <div className="flex items-center justify-between max-w-[2000px] mx-auto flex-wrap gap-3">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <FileCode className="w-5 h-5 md:w-6 md:h-6 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-base md:text-xl font-bold truncate">{project.project_name}</h1>
                  <p className="text-xs md:text-sm text-muted-foreground truncate">
                    {project.platform} • {project.mc_version}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCompile}
                  disabled={isCompiling}
                  className="rounded-xl text-xs md:text-sm"
                >
                  {isCompiling ? (
                    <RotateCw className="w-3 h-3 md:w-4 md:h-4 animate-spin md:mr-2" />
                  ) : (
                    <Play className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                  )}
                  <span className="hidden md:inline">{isCompiling ? "Compiling..." : "Compile"}</span>
                </Button>

                <Button
                  variant={hasGenerationError ? "default" : "secondary"}
                  size="sm"
                  onClick={handleAutoFix}
                  disabled={isFixing}
                  className={`rounded-xl text-xs md:text-sm ${hasGenerationError ? 'animate-pulse bg-orange-600 hover:bg-orange-700 text-white' : ''}`}
                >
                  {isFixing ? (
                    <RotateCw className="w-3 h-3 md:w-4 md:h-4 animate-spin md:mr-2" />
                  ) : (
                    <Sparkles className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                  )}
                  <span className="hidden sm:inline">{hasGenerationError ? '🔧 Click to Fix' : 'Auto Fix'}</span>
                </Button>

                {compiledJar && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleDownload} 
                    className="rounded-xl bg-green-600 hover:bg-green-700 text-xs md:text-sm"
                    title="Note: This is a simulated JAR. For real Minecraft plugins, compile the source code using Gradle/Maven on your local machine."
                  >
                    <Download className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                    <span className="hidden sm:inline">JAR (Demo)</span>
                  </Button>
                )}

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownload} 
                  className="rounded-xl text-xs md:text-sm"
                >
                  <Download className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                  <span className="hidden sm:inline">{compiledJar ? "Source" : "Download"}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
            {/* File tree */}
            <div className="w-full lg:w-64 border-b lg:border-r lg:border-b-0 border-border bg-card/30 overflow-y-auto max-h-32 lg:max-h-none">
              <div className="p-3 md:p-4">
                <div className="flex items-center gap-2 mb-3 md:mb-4 text-xs md:text-sm font-semibold text-muted-foreground">
                  <FolderOpen className="w-3 h-3 md:w-4 md:h-4" />
                  PROJECT FILES
                </div>

                <div className="space-y-1 flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-2 lg:gap-0">
                  {project.files.length === 0 && isGenerating ? (
                    // Show skeleton files while generating
                    <>
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg">
                          <Skeleton className="w-4 h-4 rounded" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      ))}
                    </>
                  ) : (
                    project.files.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs md:text-sm transition-colors whitespace-nowrap lg:w-full ${
                          selectedFile?.path === file.path
                            ? "bg-primary/20 text-primary border border-primary/50"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <File className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                        <span className="truncate">{file.path.split("/").pop()}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 flex flex-col">
              {project.files.length === 0 && isGenerating ? (
                // Show skeleton editor while generating
                <div className="flex-1 flex flex-col">
                  <div className="border-b border-border px-3 md:px-6 py-2 md:py-3 bg-muted/30">
                    <div className="flex items-center gap-2 text-xs md:text-sm">
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                  <div className="flex-1 p-6 space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ) : selectedFile ? (
                <>
                  <div className="border-b border-border px-3 md:px-6 py-2 md:py-3 bg-muted/30">
                    <div className="flex items-center gap-2 text-xs md:text-sm">
                      <File className="w-3 h-3 md:w-4 md:h-4 text-primary flex-shrink-0" />
                      <span className="font-mono truncate">{selectedFile.path}</span>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0">
                    <MemoizedEditor
                      height="100%"
                      language={selectedFile.path.endsWith(".java") ? "java" : "yaml"}
                      value={selectedFile.content}
                      onChange={handleFileEdit}
                      theme="vs-dark"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        lineNumbers: "on",
                        roundedSelection: false,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 12 },
                        wordWrap: "on",
                        quickSuggestions: false,
                        suggestOnTriggerCharacters: false,
                        parameterHints: { enabled: false },
                        hover: { enabled: false },
                        folding: false,
                        renderLineHighlight: "none",
                        contextmenu: false,
                        acceptSuggestionOnCommitCharacter: false,
                        acceptSuggestionOnEnter: "off",
                        tabCompletion: "off",
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  Select a file to view
                </div>
              )}

              {/* AI Prompt Section */}
              <div className="border-t border-border bg-card/50 flex flex-col">
                {/* Build Console */}
                <div className="h-[80px] md:h-[200px] overflow-hidden flex flex-col border-b border-border">
                  <div className="flex items-center justify-between gap-2 px-3 md:px-6 py-2 md:py-3 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                      <span className="text-xs md:text-sm font-semibold">Build Console</span>
                    </div>
                    {hasGenerationError && (
                      <div className="flex items-center gap-2 text-xs text-orange-500 animate-pulse">
                        <Sparkles className="w-3 h-3" />
                        <span>Error detected - Click Auto Fix</span>
                      </div>
                    )}
                  </div>

                  <div 
                    ref={setBuildConsoleRef}
                    className="flex-1 overflow-y-auto p-2 md:p-4 font-mono text-xs md:text-sm space-y-1 md:space-y-2"
                  >
                    {buildLogs.map((log, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2 md:gap-3"
                      >
                        <span className="text-muted-foreground text-xs whitespace-nowrap">[{log.time}]</span>
                        <span
                          className={`text-xs md:text-sm break-words ${
                            log.type === "success"
                              ? "text-green-500"
                              : log.type === "error"
                              ? "text-red-500"
                              : "text-foreground"
                          }`}
                        >
                          {log.message}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* AI Prompt Input */}
                <div className="p-3 md:p-4 bg-background/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">AI Assistant - Describe changes to apply</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && e.ctrlKey) {
                          e.preventDefault();
                          handleAiPrompt();
                        }
                      }}
                      placeholder="Describe changes... (Shift+Enter for new line, Ctrl+Enter to send)"
                      disabled={isProcessingPrompt}
                      className="flex-1 min-h-[100px] max-h-[200px] resize-y"
                      rows={4}
                    />
                    <Button
                      onClick={handleAiPrompt}
                      disabled={isProcessingPrompt || !aiPrompt.trim()}
                      size="sm"
                      className="px-4 h-[100px]"
                    >
                      {isProcessingPrompt ? (
                        <RotateCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
