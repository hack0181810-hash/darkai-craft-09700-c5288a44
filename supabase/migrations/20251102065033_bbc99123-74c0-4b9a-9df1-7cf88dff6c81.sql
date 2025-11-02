-- Allow everyone to view all projects in the community
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;

CREATE POLICY "Anyone can view projects"
  ON public.projects
  FOR SELECT
  USING (true);

-- Create trigger to automatically create user_credits when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;

CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_credits();