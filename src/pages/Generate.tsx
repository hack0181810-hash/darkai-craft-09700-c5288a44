import { Navbar } from "@/components/Navbar";
import { GenerationForm } from "@/components/GenerationForm";
import { useState, useEffect, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Code2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const Generate = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/auth');
      } else {
        setUser(data.user);
      }
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGenerate = async (data: {
    description: string;
    pluginType: string;
    mcVersion: string;
    model: string;
  }) => {
    if (!user) return;

    setIsGenerating(true);

    try {
      // For large prompts (>300 chars), use background generation
      if (data.description.length > 300) {
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

        // Trigger background generation
        supabase.functions.invoke('generate-plugin-background', {
          body: { job_id: jobData.id }
        });

        toast.success('Generation started! Redirecting to sandbox...');
        setTimeout(() => navigate('/sandbox'), 1500);
      } else {
        // For small prompts, use direct generation
        const { data: result, error } = await supabase.functions.invoke('generate-plugin', {
          body: data
        });

        if (error) throw error;

        if (result?.project_id) {
          toast.success('Plugin generated successfully!');
          navigate('/sandbox');
        }
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || 'Failed to generate plugin');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 px-4 md:px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                <Code2 className="w-8 h-8 text-white" />
              </div>
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Generate Your Plugin
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Describe your Minecraft plugin idea and let AI create it for you
            </p>
          </div>

          {/* Generation Form */}
          <GenerationForm onGenerate={handleGenerate} isGenerating={isGenerating} />
        </div>
      </div>
    </div>
  );
};

export default memo(Generate);
