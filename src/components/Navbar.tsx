import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Code2, LogOut, Coins, User, Settings, History, Gift, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetPortal } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";

export const Navbar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [avatarColor, setAvatarColor] = useState("");
  const [credits, setCredits] = useState<number>(0);
  const [claimStreak, setClaimStreak] = useState<number>(0);
  const [canClaim, setCanClaim] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchCredits();
      checkAdminRole();
    }
  }, [user]);

  const checkAdminRole = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user?.id)
      .eq('role', 'admin')
      .maybeSingle();
    
    setIsAdmin(!!data);
  };

  const fetchCredits = async () => {
    const { data, error } = await supabase
      .from('user_credits')
      .select('credits, claim_streak, last_claim_date')
      .eq('user_id', user?.id)
      .single();
    
    if (data && !error) {
      setCredits(data.credits);
      setClaimStreak(data.claim_streak || 0);
      
      // Check if user can claim today
      const today = new Date().toISOString().split('T')[0];
      const lastClaim = data.last_claim_date;
      setCanClaim(!lastClaim || lastClaim !== today);
    }
  };

  const handleDailyClaim = async () => {
    if (!user || !canClaim) return;

    const today = new Date().toISOString().split('T')[0];
    const newStreak = claimStreak + 1;

    if (newStreak > 7) {
      toast.error("You've claimed all 7 days!");
      return;
    }

    const { error } = await supabase
      .from('user_credits')
      .update({
        credits: credits + 10000,
        claim_streak: newStreak,
        last_claim_date: today
      })
      .eq('user_id', user.id);

    if (!error) {
      setCredits(credits + 10000);
      setClaimStreak(newStreak);
      setCanClaim(false);
      toast.success(`Day ${newStreak}/7: Claimed 10,000 credits!`);
    } else {
      toast.error("Failed to claim credits");
    }
  };

  useEffect(() => {
    // Generate random avatar color for each user
    if (user) {
      const colors = [
        "hsl(190 100% 50%)", // cyan
        "hsl(140 100% 45%)", // green
        "hsl(280 100% 60%)", // purple
        "hsl(30 100% 50%)",  // orange
        "hsl(340 100% 50%)", // pink
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      setAvatarColor(randomColor);
    }
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 md:gap-3 group">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary group-hover:scale-110 transition-transform duration-300">
            <Code2 className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <span className="text-xl md:text-2xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            DARK AI
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-4">
          {user ? (
            <>
              {claimStreak < 7 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      className="gap-2"
                      variant={canClaim ? "default" : "outline"}
                    >
                      <Gift className="w-4 h-4" />
                      <span className="hidden md:inline">
                        {canClaim ? `Claim Day ${claimStreak + 1}/7` : `Day ${claimStreak}/7`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 bg-background/95 backdrop-blur-sm border-primary/20 z-50">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-bold text-lg">Daily Rewards</h4>
                        <p className="text-sm text-muted-foreground">
                          Claim your daily credits and build your streak!
                        </p>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                          <div className="space-y-1">
                            <p className="font-semibold">Day {claimStreak + 1} Reward</p>
                            <p className="text-sm text-muted-foreground">10,000 credits</p>
                          </div>
                          <div className="text-2xl font-bold text-primary">+10K</div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Streak Progress</span>
                            <span className="font-semibold">{claimStreak}/7 days</span>
                          </div>
                          <div className="w-full bg-secondary/20 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all"
                              style={{ width: `${(claimStreak / 7) * 100}%` }}
                            />
                          </div>
                        </div>
                        
                        <Button
                          onClick={handleDailyClaim}
                          disabled={!canClaim}
                          className="w-full"
                          size="lg"
                        >
                          {canClaim ? `Claim Day ${claimStreak + 1}` : 'Already Claimed Today'}
                        </Button>
                        
                        {!canClaim && (
                          <p className="text-xs text-center text-muted-foreground">
                            Come back tomorrow for your next reward
                          </p>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-full p-0 h-10 w-10">
                    <Avatar className="h-10 w-10" style={{ backgroundColor: avatarColor }}>
                      <AvatarFallback className="text-white font-bold">
                        {user.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 bg-card border-border/50 p-0">
                  <div className="flex flex-col">
                    {/* User Info Section */}
                    <div className="p-4 border-b border-border/50">
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="h-12 w-12" style={{ backgroundColor: avatarColor }}>
                          <AvatarFallback className="text-white font-bold text-lg">
                            {user.email?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {user.email?.split('@')[0]}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      
                      {/* Credits Display */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                        <div className="flex items-center gap-2">
                          <Coins className="w-5 h-5 text-primary" />
                          <span className="text-sm font-medium text-foreground">Tokens</span>
                        </div>
                        <span className="text-lg font-bold text-foreground">{credits.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      {isAdmin && (
                        <button 
                          onClick={() => navigate('/admin')}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left bg-primary/5 border-l-2 border-primary"
                        >
                          <Shield className="w-5 h-5 text-primary" />
                          <span className="text-foreground font-bold">Admin Dashboard</span>
                        </button>
                      )}
                      <button 
                        onClick={() => navigate('/profile')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                      >
                        <User className="w-5 h-5 text-muted-foreground" />
                        <span className="text-foreground font-medium">Profile</span>
                      </button>
                      <button 
                        onClick={() => navigate('/settings')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                      >
                        <Settings className="w-5 h-5 text-muted-foreground" />
                        <span className="text-foreground font-medium">Settings</span>
                      </button>
                      <button 
                        onClick={() => navigate('/history')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                      >
                        <History className="w-5 h-5 text-muted-foreground" />
                        <span className="text-foreground font-medium">History</span>
                      </button>
                    </div>

                    {/* Sign Out */}
                    <div className="border-t border-border/50 p-2">
                      <button 
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-destructive/10 transition-colors text-left rounded-md"
                      >
                        <LogOut className="w-5 h-5 text-destructive" />
                        <span className="text-destructive font-medium">Sign out</span>
                      </button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-xl p-2">
                    <div className="flex flex-col gap-1.5 w-5 h-5 items-end justify-center">
                      <div className="w-5 h-0.5 bg-foreground rounded-full" />
                      <div className="w-4 h-0.5 bg-foreground rounded-full" />
                      <div className="w-5 h-0.5 bg-foreground rounded-full" />
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetPortal>
                  <SheetPrimitive.Content className="fixed z-50 gap-4 bg-card p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 inset-y-0 right-0 h-auto w-64 max-h-[320px] top-16 rounded-bl-2xl border-l border-b data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
                    <div className="flex flex-col gap-6 pb-6">
                      <Link to="/community" className="text-lg font-semibold hover:text-primary transition-colors">
                        Community Creations
                      </Link>
                      <a href="#features" className="text-lg font-semibold hover:text-primary transition-colors">
                        Features
                      </a>
                      <a href="#how-it-works" className="text-lg font-semibold hover:text-primary transition-colors">
                        How It Works
                      </a>
                    </div>
                    <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                      <Code2 className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </SheetPrimitive.Close>
                  </SheetPrimitive.Content>
                </SheetPortal>
              </Sheet>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-xl p-2">
                    <div className="flex flex-col gap-1.5 w-5 h-5 items-end justify-center">
                      <div className="w-5 h-0.5 bg-foreground rounded-full" />
                      <div className="w-4 h-0.5 bg-foreground rounded-full" />
                      <div className="w-5 h-0.5 bg-foreground rounded-full" />
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetPortal>
                  <SheetPrimitive.Content className="fixed z-50 gap-4 bg-card p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 inset-y-0 right-0 h-auto w-64 max-h-[280px] top-16 rounded-bl-2xl border-l border-b data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
                    <div className="flex flex-col gap-6 pb-6">
                      <Link to="/community" className="text-lg font-semibold hover:text-primary transition-colors">
                        Community Creations
                      </Link>
                      <Link to="/auth" className="text-lg font-semibold hover:text-primary transition-colors">
                        Login
                      </Link>
                      <a href="#features" className="text-lg font-semibold hover:text-primary transition-colors">
                        Features
                      </a>
                      <a href="#how-it-works" className="text-lg font-semibold hover:text-primary transition-colors">
                        How It Works
                      </a>
                    </div>
                    <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                      <Code2 className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </SheetPrimitive.Close>
                  </SheetPrimitive.Content>
                </SheetPortal>
              </Sheet>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
