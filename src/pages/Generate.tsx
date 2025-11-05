import { Navbar } from "@/components/Navbar";
import { GenerationForm } from "@/components/GenerationForm";
import { useState, useEffect, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

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
      toast.success('Starting generation...');
      
      // Always navigate to sandbox immediately
      navigate('/sandbox', { 
        state: { 
          generateData: data,
          startGeneration: true 
        } 
      });
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || 'Failed to start generation');
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
          {/* Generation Form */}
          <GenerationForm onGenerate={handleGenerate} isGenerating={isGenerating} />
        </div>
      </div>
    </div>
  );
};

export default memo(Generate);
