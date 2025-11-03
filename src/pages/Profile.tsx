import { useEffect, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Mail, Calendar, Coins } from "lucide-react";

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState<number>(0);
  const [avatarColor, setAvatarColor] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate("/auth");
      } else {
        setUser(data.user);
        fetchCredits(data.user.id);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (user) {
      const colors = [
        "hsl(190 100% 50%)",
        "hsl(140 100% 45%)",
        "hsl(280 100% 60%)",
        "hsl(30 100% 50%)",
        "hsl(340 100% 50%)",
      ];
      setAvatarColor(colors[Math.floor(Math.random() * colors.length)]);
    }
  }, [user]);

  const fetchCredits = async (userId: string) => {
    const { data } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .single();
    
    if (data) {
      setCredits(data.credits);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-20 md:pt-24 pb-12">
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-6 md:mb-8">
          Profile
        </h1>

        <Card className="p-6 md:p-8 bg-card/50 backdrop-blur border-border/50">
          <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-6 mb-6 md:mb-8">
            <Avatar className="h-16 w-16 md:h-24 md:w-24" style={{ backgroundColor: avatarColor }}>
              <AvatarFallback className="text-white font-bold text-2xl md:text-3xl">
                {user.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
                {user.email?.split('@')[0]}
              </h2>
              <div className="flex flex-col gap-2 text-sm md:text-base text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span className="break-all">{user.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <Coins className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Total Credits</p>
                  <p className="text-2xl md:text-3xl font-bold text-foreground">{credits.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default memo(Profile);