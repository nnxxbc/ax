import { AppLayout } from "@/components/layout/app-layout";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Home } from "@/pages/home";
import { Simulate } from "@/pages/simulate";
import { History } from "@/pages/history";
import { Settings } from "@/pages/settings";
import { NfcTags } from "@/pages/nfc-tags";
import { Insights } from "@/pages/insights";
import { Dev } from "@/pages/dev";
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
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/simulate" component={Simulate} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route path="/nfc-tags" component={NfcTags} />
        <Route path="/insights" component={Insights} />
        <Route path="/dev" component={Dev} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

export default App;