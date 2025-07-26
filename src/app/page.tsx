import { VirtualTryOnInterface } from "@/components/VirtualTryOn";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <VirtualTryOnInterface />
      <Toaster />
    </div>
  );
}
