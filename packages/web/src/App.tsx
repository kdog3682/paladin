// @paladin/web/src/App.tsx
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
} from "@bklearn/shadcn"

export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-2xl mx-auto space-y-8">

        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Component Test</h1>
          <p className="text-muted-foreground">Verifying @bklearn/shadcn + Tailwind v4</p>
        </header>

        <Separator />

        <Alert>
          <AlertTitle>Tailwind + shadcn working</AlertTitle>
          <AlertDescription>
            If you can see styled components, both are loading correctly.
          </AlertDescription>
        </Alert>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Input</h2>
          <Input placeholder="Type something..." className="max-w-sm" />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Tabs</h2>
          <Tabs defaultValue="one">
            <TabsList>
              <TabsTrigger value="one">Tab One</TabsTrigger>
              <TabsTrigger value="two">Tab Two</TabsTrigger>
              <TabsTrigger value="three">Tab Three</TabsTrigger>
            </TabsList>
            <TabsContent value="one">
              <Card>
                <CardHeader>
                  <CardTitle>Card in Tab One</CardTitle>
                  <CardDescription>Using semantic bg-card, text-card-foreground</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">This card uses CSS variables from the globals.css theme.</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="two">
              <Card>
                <CardHeader>
                  <CardTitle>Tab Two Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {["primary", "secondary", "accent"].map(c => (
                      <div key={c} className={`rounded-md p-4 bg-${c} text-${c}-foreground text-sm text-center font-medium`}>
                        {c}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="three">
              <Card>
                <CardHeader>
                  <CardTitle>Tab Three Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-foreground">text-foreground</p>
                  <p className="text-muted-foreground">text-muted-foreground</p>
                  <p className="text-primary">text-primary</p>
                  <p className="text-destructive">text-destructive</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

      </div>
    </div>
  )
}
