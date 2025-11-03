import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, TrendingUp, Code, DollarSign, Shield, Activity } from "lucide-react";

interface UserData {
  id: string;
  email: string;
  credits: number;
  claim_streak: number;
  created_at: string;
}

interface AnalyticsData {
  total_users: number;
  total_projects: number;
  total_credits_distributed: number;
  projects_today: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    total_users: 0,
    total_projects: 0,
    total_credits_distributed: 0,
    projects_today: 0
  });
  const [selectedUser, setSelectedUser] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        toast.error('Access denied: Admin only');
        navigate('/');
        return;
      }

      setIsAdmin(true);
      await Promise.all([fetchUsers(), fetchAnalytics()]);
    } catch (error) {
      console.error('Error checking admin access:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    
    const usersWithCredits = await Promise.all(
      (authUsers?.users || []).map(async (user) => {
        const { data: credits } = await supabase
          .from('user_credits')
          .select('credits, claim_streak')
          .eq('user_id', user.id)
          .maybeSingle();

        return {
          id: user.id,
          email: user.email || 'N/A',
          credits: credits?.credits || 0,
          claim_streak: credits?.claim_streak || 0,
          created_at: user.created_at
        };
      })
    );

    setUsers(usersWithCredits);
  };

  const fetchAnalytics = async () => {
    const [usersCount, projectsCount, creditsData, todayProjects] = await Promise.all([
      supabase.from('user_credits').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('user_credits').select('credits'),
      supabase.from('projects')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0])
    ]);

    const totalCredits = creditsData.data?.reduce((sum, u) => sum + (u.credits || 0), 0) || 0;

    setAnalytics({
      total_users: usersCount.count || 0,
      total_projects: projectsCount.count || 0,
      total_credits_distributed: totalCredits,
      projects_today: todayProjects.count || 0
    });
  };

  // Optimized input handlers with useCallback
  const handleSelectedUserChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedUser(e.target.value);
  }, []);

  const handleCreditAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCreditAmount(e.target.value);
  }, []);

  const handleGiveCredits = useCallback(async () => {
    if (!selectedUser || !creditAmount) {
      toast.error('Please select a user and enter credit amount');
      return;
    }

    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid credit amount');
      return;
    }

    try {
      const { data: currentCredits } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', selectedUser)
        .single();

      const { error } = await supabase
        .from('user_credits')
        .update({ credits: (currentCredits?.credits || 0) + amount })
        .eq('user_id', selectedUser);

      if (error) throw error;

      toast.success(`Added ${amount} credits successfully`);
      setCreditAmount('');
      setSelectedUser('');
      await fetchUsers();
    } catch (error) {
      console.error('Error giving credits:', error);
      toast.error('Failed to add credits');
    }
  }, [selectedUser, creditAmount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center">
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-20 md:pt-24 px-4 md:px-6 pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 md:mb-8">
            <div className="flex items-center gap-2 md:gap-3 mb-2">
              <Shield className="w-6 h-6 md:w-8 md:h-8 text-primary" />
              <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
            </div>
            <p className="text-sm md:text-base text-muted-foreground">Manage users, credits, and view analytics</p>
          </div>

          {/* Analytics Cards - Optimized grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_users}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
                <Code className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_projects}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Credits Distributed</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_credits_distributed.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects Today</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.projects_today}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="users" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users">User Management</TabsTrigger>
              <TabsTrigger value="credits">Give Credits</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>All Users</CardTitle>
                  <CardDescription>Manage and view all registered users</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Streak</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{user.credits.toLocaleString()}</Badge>
                          </TableCell>
                          <TableCell>{user.claim_streak}/7</TableCell>
                          <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="credits" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Give Credits to Users</CardTitle>
                  <CardDescription>Add credits to any user account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="user">Select User</Label>
                    <select
                      id="user"
                      value={selectedUser}
                      onChange={handleSelectedUserChange}
                      className="w-full p-2 rounded-md border bg-background text-sm md:text-base"
                    >
                      <option value="">Choose a user...</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.email} (Current: {user.credits.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="credits">Credit Amount</Label>
                    <Input
                      id="credits"
                      type="number"
                      placeholder="Enter amount"
                      value={creditAmount}
                      onChange={handleCreditAmountChange}
                      className="text-sm md:text-base"
                    />
                  </div>

                  <Button onClick={handleGiveCredits} className="w-full">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Give Credits
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default memo(Admin);
