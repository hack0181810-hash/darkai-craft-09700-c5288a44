import { useEffect, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { History as HistoryIcon, Code2 } from "lucide-react";

const History = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate("/auth");
      } else {
        setUser(data.user);
        fetchProjects(data.user.id);
      }
    });
  }, [navigate]);

  const fetchProjects = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (data) {
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-20 md:pt-24 pb-12">
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-6 md:mb-8">
          History
        </h1>

        <Card className="p-6 md:p-8 bg-card/50 backdrop-blur border-border/50">
          <div className="flex items-center gap-2 md:gap-3 pb-4 border-b border-border/50 mb-6">
            <HistoryIcon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-lg md:text-xl font-bold text-foreground">Your Projects</h2>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground mt-4">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <p className="text-center text-sm md:text-base text-muted-foreground py-8">No projects yet</p>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="p-3 md:p-4 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-2 md:gap-3">
                    <Code2 className="w-4 h-4 md:w-5 md:h-5 text-primary mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm md:text-base text-foreground break-words">{project.project_name}</h3>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default memo(History);