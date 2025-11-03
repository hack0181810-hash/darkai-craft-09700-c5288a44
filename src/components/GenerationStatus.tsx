import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RotateCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GenerationStatusProps {
  jobId: string;
  onComplete: (projectData: any) => void;
  onCancel: () => void;
}

export const GenerationStatus = ({ jobId, onComplete, onCancel }: GenerationStatusProps) => {
  const [status, setStatus] = useState<string>('pending');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-generation-status', {
          body: { job_id: jobId }
        });

        if (error) throw error;

        if (data.success && data.job) {
          setStatus(data.job.status);
          setProgress(data.job.progress);
          setErrorMessage(data.job.error_message || '');

          if (data.job.status === 'completed' && data.job.project_data) {
            toast.success("Plugin generated successfully!");
            onComplete(data.job.project_data);
          } else if (data.job.status === 'failed') {
            toast.error(data.job.error_message || "Generation failed");
          }
        }
      } catch (error: any) {
        console.error('Status check error:', error);
      }
    };

    // Check immediately
    checkStatus();

    // Then check every 2 seconds while processing
    const interval = setInterval(checkStatus, 2000);

    return () => clearInterval(interval);
  }, [jobId, onComplete]);

  return (
    <Card className="p-6 max-w-2xl mx-auto mt-20">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">Generating Your Plugin...</h3>
          {status === 'processing' && <Loader2 className="w-6 h-6 animate-spin text-primary" />}
          {status === 'completed' && <CheckCircle className="w-6 h-6 text-green-500" />}
          {status === 'failed' && <XCircle className="w-6 h-6 text-red-500" />}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Status: <span className="capitalize">{status}</span></div>
          
          {status === 'pending' && (
            <p className="text-sm text-muted-foreground">
              Your generation request is queued and will start shortly...
            </p>
          )}
          
          {status === 'processing' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                AI is working on your plugin. This may take a moment for complex plugins.
              </p>
              <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
                💡 Tip: You can close this page and come back later. Generation continues in the background!
              </p>
            </div>
          )}
          
          {status === 'failed' && errorMessage && (
            <p className="text-sm text-red-500">{errorMessage}</p>
          )}
        </div>

        <div className="flex gap-3">
          {(status === 'pending' || status === 'processing') && (
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Go Back
            </Button>
          )}
          
          {status === 'failed' && (
            <Button onClick={onCancel} className="flex-1">
              Try Again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};