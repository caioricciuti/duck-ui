import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Github,
  Terminal,
  BookOpen,
  Database,
  ExternalLink,
  Loader2,
  TestTubeDiagonal,
} from "lucide-react";
import { useDuckStore } from "@/store";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

const quickStartActions = [
  {
    title: "SQL Query",
    icon: <Terminal className="w-5 h-5" />,
    description: "Write and execute SQL queries on Duck DB Wasm!",
    action: "sql",
  },
  {
    title: "Explore with Examples",
    icon: <TestTubeDiagonal className="w-5 h-5" />,
    description: "Explore example query set to feel the power of DuckDB.",
    action: "examples",
  },
];

const resourceCards = [
  {
    title: "Star us on GitHub!",
    description: "Support our project by starring it on GitHub.",
    link: "https://github.com/caioricciuti/duck-ui",
    Icon: Github,
    action: "Star on GitHub",
  },
  {
    title: "DuckDB Docs",
    description: "Explore DuckDB documentation and learn more.",
    Icon: BookOpen,
    link: "https://duckdb.org/docs/",
    action: "Read Docs",
  },
  {
    title: "Duck-UI Documentation",
    Icon: ExternalLink,
    description: "Learn how to make the most of Duck-UI.",
    link: "https://duckui.com",
    action: "Learn More",
  },
];

const HomeTab = () => {
  const { createTab, queryHistory, error } = useDuckStore();
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getUsersRecentItems();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const handleNewAction = (type: string, query?: string) => {
    if (type === "sql") {
      createTab("sql", query);
    }
    if (type === "examples") {
      createTab(
        "sql",
        `
SELECT * FROM 'https://shell.duckdb.org/data/tpch/0_01/parquet/orders.parquet' LIMIT 1000;
`,
        "Duck UI Explore"
      );
    }
  };

  const getUsersRecentItems = async () => {
    setLoading(true);
    try {
      const recentQueries = await Promise.resolve(
        queryHistory.slice(0, 6).map((h) => ({
          cleaned_query: h.query,
          latest_event_time: h.timestamp,
          query_kind: "query",
        }))
      );
      setRecentItems(recentQueries);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const truncateQuery = (query: string, length: number = 50) => {
    return query.length > length ? `${query.slice(0, length)}...` : query;
  };

  //@ts-ignore
  const duck_ui_version = __DUCK_UI_VERSION__ || "Error loading version";

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto truncate">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
        <p className="text-muted-foreground">Let's get busy...</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {quickStartActions.map((action, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start space-y-2 hover:bg-accent hover:text-accent-foreground group w-full truncate"
              onClick={() => handleNewAction(action.action)}
            >
              <div className="flex items-center space-x-2 text-primary">
                <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 ">
                  {action.icon}
                </div>
                <p className="font-semibold text-base">{action.title}</p>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                {action.description}
              </p>
            </Button>
          </motion.div>
        ))}
      </motion.div>

      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger
            value="recent"
            className="flex items-center gap-2 data-[state=active]:text-primary"
          >
            Recent Queries
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          </TabsTrigger>
          <TabsTrigger
            value="resources"
            className="data-[state=active]:text-primary"
          >
            Resources
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="space-y-2">
                  <CardHeader>
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </CardHeader>
                  <CardFooter>
                    <Skeleton className="h-4 w-[150px]" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card className="p-4 text-center text-muted-foreground">
              {error}
            </Card>
          ) : recentItems.length === 0 ? (
            <Card className="p-4 text-center text-muted-foreground">
              No recent queries found
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentItems.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className="hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => handleNewAction("sql", item.cleaned_query)}
                  >
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center space-x-2">
                        <Database className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {item.query_kind || "Query"}
                        </span>
                      </CardTitle>
                      <CardDescription className="text-xs font-mono text-muted-foreground truncate">
                        {truncateQuery(item.cleaned_query)}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="text-xs text-muted-foreground">
                      {formatDate(item.latest_event_time)}
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {resourceCards.map((card, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center space-x-2">
                      <div className="p-2 rounded-full bg-primary/10">
                        <card.Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-muted-foreground">
                        {card.title}
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <a
                      href={card.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" className="w-full justify-start">
                        {card.action}
                      </Button>
                    </a>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <p className="text-muted-foreground text-center text-xs">
        Duck-UI Version: {duck_ui_version}
      </p>
    </div>
  );
};

export default HomeTab;
