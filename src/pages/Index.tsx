import { Hero } from "@/components/Hero";
import { FeatureGrid } from "@/components/FeatureGrid";
import { Navbar } from "@/components/Navbar";
import { WhitelistButton } from "@/components/WhitelistButton";
import { ProjectsList } from "@/components/ProjectsList";
import { Stats } from "@/components/Stats";
import { HowItWorks } from "@/components/HowItWorks";
import { Testimonials } from "@/components/Testimonials";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <Stats />
      <section id="features">
        <FeatureGrid />
      </section>
      <section id="how-it-works">
        <HowItWorks />
      </section>
      <Testimonials />
      {user && (
        <section id="projects-section" className="max-w-7xl mx-auto px-6 py-16 mb-16">
          <div className="mb-8">
            <h2 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Your Projects
            </h2>
            <p className="text-muted-foreground">Resume working on your saved plugins</p>
          </div>
          <ProjectsList />
        </section>
      )}
      <WhitelistButton />
    </div>
  );
};

export default Index;
