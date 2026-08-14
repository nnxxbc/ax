import { AppLayout } from "@/components/layout/app-layout";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Home } from "@/pages/home";
import { Simulate } from "@/pages/simulate";
import { History } from "@/pages/history";
import { Settings } from "@/pages/settings";
import { NfcTags } from "@/pages/nfc-tags";
import { Insights } from "@/pages/insights";
import { Dev } from "@/pages/dev";
import { Checkpoints } from "@/pages/checkpoints";
import { Thoughts } from "@/pages/thoughts";
import { AlarmSettings } from "@/pages/settings-alarm";
import { NotificationSettings } from "@/pages/settings-notifications";
import { QuietHoursSettings } from "@/pages/settings-quiet-hours";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient();

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
      <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
      <p className="text-lg text-muted-foreground">Page not found.</p>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  console.log(`[Router] Current location: "${location}"`);

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/simulate" component={Simulate} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route path="/nfc-tags" component={NfcTags} />
        <Route path="/checkpoints" component={Checkpoints} />
        <Route path="/insights" component={Insights} />
        <Route path="/thoughts" component={Thoughts} />
        <Route path="/settings/alarm" component={AlarmSettings} />
        <Route path="/settings/notifications" component={NotificationSettings} />
        <Route path="/settings/quiet-hours" component={QuietHoursSettings} />
        <Route path="/dev" component={Dev} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
  console.log(`[App] Initializing. Base: "${base}", URL: ${window.location.href}`);

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={base}>
        <Router />
      </WouterRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

export default App;