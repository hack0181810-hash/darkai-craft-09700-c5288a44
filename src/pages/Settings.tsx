import { useEffect, useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate("/auth");
      } else {
        setUser(data.user);
      }
    });
  }, [navigate]);

  const handleChangePassword = useCallback(() => {
    toast.info("Password change feature coming soon");
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-20 md:pt-24 pb-12">
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-6 md:mb-8">
          Settings
        </h1>

        <Card className="p-6 md:p-8 bg-card/50 backdrop-blur border-border/50">
          <div className="space-y-6">
            <div className="flex items-center gap-2 md:gap-3 pb-4 border-b border-border/50">
              <SettingsIcon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <h2 className="text-lg md:text-xl font-bold text-foreground">Account Settings</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Email</label>
                <p className="text-sm md:text-base text-muted-foreground break-all">{user.email}</p>
              </div>

              <div className="pt-4">
                <Button onClick={handleChangePassword} variant="outline" className="text-sm md:text-base">
                  Change Password
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default memo(Settings);