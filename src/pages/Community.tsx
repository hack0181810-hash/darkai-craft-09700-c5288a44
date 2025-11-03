import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Star, Clock, Code } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState, memo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";


interface Project {
  id: string;
  project_name: string;
  description: string | null;
  platform: string;
  mc_version: string;
  language: string;
  created_at: string;
  files: any;
}

const Community = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommunityProjects();
  }, []);

  const fetchCommunityProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = useCallback((project: Project) => {
    const files = Array.isArray(project.files) ? project.files : [];
    
    if (files.length === 0) {
      alert('No files available for download');
      return;
    }

    // Create a simple text file with project info
    const projectInfo = `# ${project.project_name}\n\n${project.description || 'No description'}\n\nPlatform: ${project.platform}\nVersion: ${project.mc_version}\nLanguage: ${project.language}\n\nFiles:\n${files.map((f: any) => `- ${f.path}`).join('\n')}`;
    
    const blob = new Blob([projectInfo], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.project_name}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);


  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-20 md:pt-24 px-4 md:px-6 pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8 md:mb-12"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-3 md:mb-4">
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Community Creations
              </span>
            </h1>
            <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Discover amazing plugins created by our community
            </p>
          </motion.div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-muted-foreground mt-4">Loading community projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <Code className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm md:text-base text-muted-foreground">No projects yet. Be the first to create one!</p>
            </div>
          ) : (

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
              >
                <Card className="h-full hover:border-primary/50 transition-all duration-200 hover:shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <CardTitle className="text-lg md:text-xl line-clamp-2">{project.project_name}</CardTitle>
                      <Badge variant="secondary" className="text-xs shrink-0">{project.platform}</Badge>
                    </div>
                    <CardDescription className="text-xs md:text-sm line-clamp-3">{project.description || 'No description provided'}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{project.language}</Badge>
                        </div>
                        <span>v{project.mc_version}</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Code className="w-4 h-4 text-primary" />
                          <span>{Array.isArray(project.files) ? project.files.length : 0} files</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{format(new Date(project.created_at), 'MMM d')}</span>
                        </div>
                      </div>

                      <Button 
                        className="w-full rounded-xl text-sm md:text-base" 
                        variant="default"
                        onClick={() => handleDownload(project)}
                      >
                        <Download className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(Community);